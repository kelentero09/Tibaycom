import 'server-only';
import { and, asc, desc, eq, gt, inArray, lt, notInArray, or, sql, type SQL } from 'drizzle-orm';
import type { Intent, PostKind } from '@/lib/community';
import type { FeedQuery } from '@/lib/validation';
import { getDb, schema } from './db';
import { currentDay, premiumSql } from './entitlements';
import { imageUrl } from './storage';

const { posts, postPhotos, postHearts, postComments, profiles, user, projects, notifications } = schema;

export const FEED_PAGE_SIZE = 20;
/** Premium posts from this recent window are pinned above the first page of the feed. */
export const FEATURED_WINDOW_MS = 3 * 86_400_000;
export const FEATURED_LIMIT = 3;

export type FeedAuthor = { profileId: string; username: string; businessName: string; avatarUrl: string | null; intent: Intent };

/** Serialisable post, safe to pass to client components. */
export type FeedPost = {
  id: string;
  kind: PostKind;
  body: string;
  province: string;
  city: string;
  heartCount: number;
  commentCount: number;
  /** ISO timestamp */
  createdAt: string;
  author: FeedAuthor;
  authorUserId: string;
  photos: { id: string; url: string }[];
  project: { id: string; title: string } | null;
  viewerHearted: boolean;
  /** Author has Premium right now. */
  authorPremium: boolean;
  /** Pinned at the top of the feed as a Premium highlight. */
  featured?: boolean;
};

export type FeedComment = { id: string; postId: string; body: string; createdAt: string; author: FeedAuthor; authorUserId: string };

/** Visible to the public: active post, active author profile, author not banned. */
const visible = () => and(eq(posts.status, 'active'), eq(profiles.status, 'active'), or(sql`${user.banned} IS NULL`, eq(user.banned, false)));

const postColumns = {
  id: posts.id,
  kind: posts.kind,
  body: posts.body,
  province: posts.province,
  city: posts.city,
  heartCount: posts.heartCount,
  commentCount: posts.commentCount,
  createdAt: posts.createdAt,
  projectId: posts.projectId,
  profileId: profiles.id,
  username: profiles.username,
  businessName: profiles.businessName,
  avatarKey: profiles.avatarKey,
  intent: profiles.intent,
  authorUserId: profiles.userId,
  authorPremium: premiumSql('profiles'),
};

async function loadPosts(where: SQL | undefined, viewerUserId: string | null, limit: number): Promise<FeedPost[]> {
  const db = getDb();
  const rows = await db
    .select(postColumns)
    .from(posts)
    .innerJoin(profiles, eq(profiles.id, posts.profileId))
    .innerJoin(user, eq(user.id, profiles.userId))
    .where(and(visible(), where))
    .orderBy(desc(posts.createdAt))
    .limit(limit);
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id);
  const projectIds = [...new Set(rows.map((r) => r.projectId).filter((p): p is string => !!p))];
  const [photos, hearts, projectRows] = await Promise.all([
    db.select({ id: postPhotos.id, key: postPhotos.key, postId: postPhotos.postId }).from(postPhotos).where(inArray(postPhotos.postId, ids)).orderBy(asc(postPhotos.sortOrder), asc(postPhotos.createdAt)),
    viewerUserId ? db.select({ postId: postHearts.postId }).from(postHearts).where(and(eq(postHearts.userId, viewerUserId), inArray(postHearts.postId, ids))) : Promise.resolve([]),
    projectIds.length ? db.select({ id: projects.id, title: projects.title }).from(projects).where(inArray(projects.id, projectIds)) : Promise.resolve([]),
  ]);
  const hearted = new Set(hearts.map((h) => h.postId));
  return rows.map((r) => ({
    id: r.id,
    kind: r.kind,
    body: r.body,
    province: r.province,
    city: r.city,
    heartCount: r.heartCount,
    commentCount: r.commentCount,
    createdAt: r.createdAt.toISOString(),
    author: { profileId: r.profileId, username: r.username, businessName: r.businessName, avatarUrl: imageUrl(r.avatarKey), intent: r.intent },
    authorUserId: r.authorUserId,
    photos: photos.filter((p) => p.postId === r.id).map((p) => ({ id: p.id, url: imageUrl(p.key)! })),
    project: projectRows.find((p) => p.id === r.projectId) ?? null,
    viewerHearted: hearted.has(r.id),
    authorPremium: !!r.authorPremium,
  }));
}

/**
 * Public feed, newest first, cursor-paginated by created_at.
 * The first page also returns up to FEATURED_LIMIT recent posts by Premium members (same filters), pinned on top;
 * they are left out of that page's chronological list so nothing shows twice. Paging itself stays purely chronological.
 */
export async function getFeed(query: FeedQuery, viewerUserId: string | null): Promise<{ featured: FeedPost[]; posts: FeedPost[]; nextBefore: number | null }> {
  const filters: SQL[] = [];
  if (query.kind) filters.push(eq(posts.kind, query.kind));
  if (query.province) filters.push(eq(posts.province, query.province));
  const featured = query.before
    ? []
    : (await loadPosts(and(...filters, sql`${premiumSql('profiles')}`, gt(posts.createdAt, new Date(Date.now() - FEATURED_WINDOW_MS))), viewerUserId, FEATURED_LIMIT)).map((p) => ({ ...p, featured: true }));
  const conditions = [...filters];
  if (query.before) conditions.push(lt(posts.createdAt, new Date(query.before)));
  if (featured.length) conditions.push(notInArray(posts.id, featured.map((p) => p.id)));
  const list = await loadPosts(conditions.length ? and(...conditions) : undefined, viewerUserId, FEED_PAGE_SIZE + 1);
  const page = list.slice(0, FEED_PAGE_SIZE);
  const last = page.at(-1);
  return { featured, posts: page, nextBefore: list.length > FEED_PAGE_SIZE && last ? new Date(last.createdAt).getTime() : null };
}

export async function getPost(id: string, viewerUserId: string | null): Promise<FeedPost | null> {
  return (await loadPosts(eq(posts.id, id), viewerUserId, 1))[0] ?? null;
}

export async function getProfilePosts(profileId: string, viewerUserId: string | null, limit = 6): Promise<FeedPost[]> {
  return loadPosts(eq(posts.profileId, profileId), viewerUserId, limit);
}

export async function listComments(postId: string): Promise<FeedComment[]> {
  const rows = await getDb()
    .select({
      id: postComments.id,
      postId: postComments.postId,
      body: postComments.body,
      createdAt: postComments.createdAt,
      profileId: profiles.id,
      username: profiles.username,
      businessName: profiles.businessName,
      avatarKey: profiles.avatarKey,
      intent: profiles.intent,
      authorUserId: profiles.userId,
    })
    .from(postComments)
    .innerJoin(profiles, eq(profiles.id, postComments.profileId))
    .innerJoin(user, eq(user.id, profiles.userId))
    .where(and(eq(postComments.postId, postId), eq(postComments.status, 'active'), eq(profiles.status, 'active'), or(sql`${user.banned} IS NULL`, eq(user.banned, false))))
    .orderBy(asc(postComments.createdAt))
    .limit(200);
  return rows.map((r) => ({
    id: r.id,
    postId: r.postId,
    body: r.body,
    createdAt: r.createdAt.toISOString(),
    author: { profileId: r.profileId, username: r.username, businessName: r.businessName, avatarUrl: imageUrl(r.avatarKey), intent: r.intent },
    authorUserId: r.authorUserId,
  }));
}

/** An active post that may receive hearts and comments (author visible). */
export async function getInteractablePost(id: string) {
  return getDb()
    .select({ id: posts.id, profileId: posts.profileId, authorUserId: profiles.userId })
    .from(posts)
    .innerJoin(profiles, eq(profiles.id, posts.profileId))
    .innerJoin(user, eq(user.id, profiles.userId))
    .where(and(eq(posts.id, id), visible()))
    .get();
}

export type NotificationItem = {
  id: string;
  type: 'heart' | 'comment';
  postId: string | null;
  read: boolean;
  createdAt: string;
  actor: { username: string; businessName: string; avatarUrl: string | null } | null;
};

export async function listNotifications(userId: string, limit = 30): Promise<{ items: NotificationItem[]; unread: number }> {
  const db = getDb();
  const [rows, unread] = await Promise.all([
    db
      .select({
        id: notifications.id,
        type: notifications.type,
        postId: notifications.postId,
        readAt: notifications.readAt,
        createdAt: notifications.createdAt,
        username: profiles.username,
        businessName: profiles.businessName,
        avatarKey: profiles.avatarKey,
      })
      .from(notifications)
      .leftJoin(profiles, eq(profiles.id, notifications.actorProfileId))
      .where(eq(notifications.userId, userId))
      .orderBy(desc(notifications.createdAt))
      .limit(limit),
    countUnreadNotifications(userId),
  ]);
  return {
    unread,
    items: rows.map((r) => ({
      id: r.id,
      type: r.type,
      postId: r.postId,
      read: !!r.readAt,
      createdAt: r.createdAt.toISOString(),
      actor: r.username ? { username: r.username, businessName: r.businessName ?? r.username, avatarUrl: imageUrl(r.avatarKey) } : null,
    })),
  };
}

export async function countUnreadNotifications(userId: string) {
  return getDb().$count(notifications, and(eq(notifications.userId, userId), sql`${notifications.readAt} IS NULL`));
}

/** Notifies a post author; never notifies yourself. */
export function notificationValues(recipientUserId: string, actor: { userId: string; profileId: string }, type: 'heart' | 'comment', postId: string) {
  if (recipientUserId === actor.userId) return null;
  return { id: crypto.randomUUID(), userId: recipientUserId, type, actorProfileId: actor.profileId, postId };
}

/** Admin moderation listing: newest posts regardless of status. */
export async function listPostsForAdmin(limit = 50) {
  return getDb()
    .select({ id: posts.id, body: posts.body, kind: posts.kind, status: posts.status, createdAt: posts.createdAt, heartCount: posts.heartCount, commentCount: posts.commentCount, username: profiles.username, businessName: profiles.businessName })
    .from(posts)
    .innerJoin(profiles, eq(profiles.id, posts.profileId))
    .orderBy(desc(posts.createdAt))
    .limit(limit);
}

export async function listContentReports(limit = 100) {
  const db = getDb();
  return db
    .select({
      id: schema.reports.id,
      postId: schema.reports.postId,
      commentId: schema.reports.commentId,
      reason: schema.reports.reason,
      details: schema.reports.details,
      createdAt: schema.reports.createdAt,
      postBody: posts.body,
      postStatus: posts.status,
      commentBody: postComments.body,
      commentStatus: postComments.status,
      username: profiles.username,
    })
    .from(schema.reports)
    .innerJoin(posts, eq(posts.id, schema.reports.postId))
    .leftJoin(postComments, eq(postComments.id, schema.reports.commentId))
    .innerJoin(profiles, eq(profiles.id, schema.reports.profileId))
    .where(eq(schema.reports.status, 'open'))
    .orderBy(desc(schema.reports.createdAt))
    .limit(limit);
}

/** Posts the user has created today (Manila day), for the composer's remaining-quota hint. */
export async function postsUsedToday(userId: string) {
  const { usageCounters } = schema;
  const row = await getDb()
    .select({ count: usageCounters.count })
    .from(usageCounters)
    .where(and(eq(usageCounters.userId, userId), eq(usageCounters.period, currentDay()), eq(usageCounters.kind, 'post')))
    .get();
  return row?.count ?? 0;
}
