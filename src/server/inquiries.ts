import 'server-only';
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import { getDb, getEnv, newId, schema } from './db';
import { sendEmail } from './email';
import { ApiError } from './http';

const { inquiries, inquiryMessages, profiles, user } = schema;

/** Longest conversation we keep on one request (spam guard; a real job moves to a quotation long before this). */
export const MAX_THREAD_MESSAGES = 100;

export type InquiryMessage = { id: string; sender: 'pro' | 'client'; body: string; createdAt: number };

/** 256-bit secret for the client's private conversation link. */
export function newThreadToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
export const THREAD_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

/** The contact field is free text; only a clear email address gets reply notifications. */
export const emailFromContact = (contact: string) => {
  const trimmed = contact.trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed) && trimmed.length <= 120 ? trimmed : null;
};

export const threadUrl = (token: string) => `${getEnv().PUBLIC_SITE_URL}/r/${token}`;

export async function listMessages(inquiryIds: string[]): Promise<Map<string, InquiryMessage[]>> {
  const map = new Map<string, InquiryMessage[]>();
  if (!inquiryIds.length) return map;
  const rows = await getDb().select().from(inquiryMessages).where(inArray(inquiryMessages.inquiryId, inquiryIds)).orderBy(asc(inquiryMessages.createdAt));
  for (const r of rows) map.set(r.inquiryId, [...(map.get(r.inquiryId) ?? []), { id: r.id, sender: r.sender, body: r.body, createdAt: r.createdAt.getTime() }]);
  return map;
}

/** The client's view of a conversation, found by its secret token. */
export async function getThreadByToken(token: string) {
  if (!THREAD_TOKEN_PATTERN.test(token)) return null;
  const row = await getDb()
    .select({
      inquiry: inquiries,
      username: profiles.username,
      businessName: profiles.businessName,
      avatarKey: profiles.avatarKey,
      profileActive: sql<number>`${profiles.status} = 'active' AND ${profiles.isPublished} = 1`,
    })
    .from(inquiries)
    .innerJoin(profiles, eq(profiles.id, inquiries.profileId))
    .where(eq(inquiries.threadToken, token))
    .get();
  if (!row) return null;
  const messages = (await listMessages([row.inquiry.id])).get(row.inquiry.id) ?? [];
  return { ...row, profileActive: !!row.profileActive, messages };
}

export async function markClientRead(inquiryId: string) {
  await getDb().update(inquiries).set({ clientReadAt: new Date() }).where(eq(inquiries.id, inquiryId));
}

/**
 * Appends a message. The cap check and insert are one statement, so parallel posts cannot exceed it.
 * A client message puts the request back to "new" in the professional's inbox.
 */
async function appendMessage(inquiryId: string, sender: 'pro' | 'client', body: string) {
  const db = getDb();
  const id = newId();
  const now = Date.now();
  const inserted = await db.all<{ id: string }>(sql`
    INSERT INTO inquiry_messages (id, inquiry_id, sender, body, created_at)
    SELECT ${id}, ${inquiryId}, ${sender}, ${body}, ${now}
    WHERE (SELECT COUNT(*) FROM inquiry_messages WHERE inquiry_id = ${inquiryId}) < ${MAX_THREAD_MESSAGES}
    RETURNING id`);
  if (!inserted.length) throw new ApiError(409, 'This conversation is full. Please continue by phone or email.', 'thread_full');
  await db
    .update(inquiries)
    .set(sender === 'client' ? { lastMessageAt: new Date(now), status: 'new' } : { lastMessageAt: new Date(now), status: sql`CASE WHEN ${inquiries.status} = 'new' THEN 'read' ELSE ${inquiries.status} END` })
    .where(eq(inquiries.id, inquiryId));
  return { id, sender, body, createdAt: now } satisfies InquiryMessage;
}

/** Professional → client. Creates a conversation link for older requests that have none, and emails the client when we can. */
export async function replyAsPro(profileId: string, inquiryId: string, body: string) {
  const db = getDb();
  const row = await db
    .select({ inquiry: inquiries, businessName: profiles.businessName })
    .from(inquiries)
    .innerJoin(profiles, eq(profiles.id, inquiries.profileId))
    .where(and(eq(inquiries.id, inquiryId), eq(inquiries.profileId, profileId)))
    .get();
  if (!row) throw new ApiError(404, 'Request not found.');
  let token = row.inquiry.threadToken;
  if (!token) {
    token = newThreadToken();
    await db.update(inquiries).set({ threadToken: token }).where(and(eq(inquiries.id, inquiryId), sql`${inquiries.threadToken} IS NULL`));
    token = (await db.select({ t: inquiries.threadToken }).from(inquiries).where(eq(inquiries.id, inquiryId)).get())?.t ?? token;
  }
  const message = await appendMessage(inquiryId, 'pro', body);
  const to = emailFromContact(row.inquiry.contact);
  let emailed = false;
  if (to)
    emailed = await sendEmail({
      to,
      subject: `${row.businessName} replied to your quotation request`,
      heading: `${row.businessName} replied`,
      paragraphs: [`Hi ${row.inquiry.name},`, `${row.businessName} replied to your request on Tibay:`, body, 'Open the conversation to reply. Keep this link private — anyone with it can read and reply.'],
      action: { label: 'View and reply', url: threadUrl(token) },
    });
  return { message, emailed, threadUrl: threadUrl(token) };
}

/** Client → professional, through the secret link. */
export async function replyAsClient(token: string, body: string) {
  const thread = await getThreadByToken(token);
  if (!thread) throw new ApiError(404, 'Conversation not found.');
  if (!thread.profileActive) throw new ApiError(410, 'This professional is no longer accepting messages on Tibay.', 'closed');
  const message = await appendMessage(thread.inquiry.id, 'client', body);
  await markClientRead(thread.inquiry.id);
  const owner = await getDb()
    .select({ contactEmail: profiles.contactEmail, accountEmail: user.email })
    .from(profiles)
    .innerJoin(user, eq(user.id, profiles.userId))
    .where(eq(profiles.id, thread.inquiry.profileId))
    .get();
  if (owner)
    await sendEmail({
      to: owner.contactEmail || owner.accountEmail,
      subject: `New reply from ${thread.inquiry.name}`,
      heading: `${thread.inquiry.name} replied`,
      paragraphs: [`${thread.inquiry.name} replied to your conversation on Tibay:`, body],
      action: { label: 'Open my inbox', url: `${getEnv().PUBLIC_SITE_URL}/inbox` },
    });
  return message;
}

/** Requests a signed-in member sent, newest activity first, with an unread flag for replies they have not seen. */
export async function listSentRequests(userId: string) {
  const rows = await getDb()
    .select({
      id: inquiries.id,
      threadToken: inquiries.threadToken,
      message: inquiries.message,
      createdAt: inquiries.createdAt,
      lastMessageAt: inquiries.lastMessageAt,
      clientReadAt: inquiries.clientReadAt,
      businessName: profiles.businessName,
      username: profiles.username,
      avatarKey: profiles.avatarKey,
      lastProReplyAt: sql<number | null>`(SELECT MAX(created_at) FROM inquiry_messages m WHERE m.inquiry_id = ${inquiries.id} AND m.sender = 'pro')`,
      replies: sql<number>`(SELECT COUNT(*) FROM inquiry_messages m WHERE m.inquiry_id = ${inquiries.id} AND m.sender = 'pro')`,
    })
    .from(inquiries)
    .innerJoin(profiles, eq(profiles.id, inquiries.profileId))
    .where(eq(inquiries.senderUserId, userId))
    .orderBy(desc(sql`COALESCE(${inquiries.lastMessageAt}, ${inquiries.createdAt})`))
    .limit(100);
  return rows.map((r) => ({ ...r, unread: r.lastProReplyAt != null && (!r.clientReadAt || r.lastProReplyAt > r.clientReadAt.getTime()) }));
}

export async function countUnreadSentRequests(userId: string) {
  const row = await getDb().get<{ n: number }>(sql`
    SELECT COUNT(*) AS n FROM inquiries i
    WHERE i.sender_user_id = ${userId}
      AND EXISTS (SELECT 1 FROM inquiry_messages m WHERE m.inquiry_id = i.id AND m.sender = 'pro' AND m.created_at > COALESCE(i.client_read_at, 0))`);
  return row?.n ?? 0;
}
