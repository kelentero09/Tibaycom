import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { authMock, call, count, createProfile, createUser, env, installFetchMock, one, outbound, setSubscription, setupTestPlatform, teardownTestPlatform } from './harness';

vi.mock('@/server/auth', () => authMock());

import { POST as proReply } from '@/app/api/inbox/[id]/messages/route';
import { POST as sendInquiry } from '@/app/api/inquiries/[username]/route';
import { POST as createPost } from '@/app/api/posts/route';
import { POST as clientReply } from '@/app/api/r/[token]/messages/route';
import { getFeed } from '@/server/community';
import { countUnreadSentRequests, getThreadByToken, listSentRequests, markClientRead, MAX_THREAD_MESSAGES } from '@/server/inquiries';
import { runDailyMaintenance } from '@/server/maintenance';
import { searchDirectory } from '@/server/profiles';

let ip = 0;
/** Each call from a fresh address, so the per-IP inquiry rate limit never interferes. */
const fromNewIp = () => ({ 'cf-connecting-ip': `198.51.100.${++ip}` });
const tokenOf = (url: unknown) => String(url).split('/r/')[1]!;

async function request(username: string, contact = 'client@example.com', as?: string) {
  const res = await call(sendInquiry, { as, body: { name: 'Lia Cruz', contact, message: 'Quotation for a bungalow please.', turnstileToken: 'ok' }, params: { username }, headers: fromNewIp() });
  expect(res.status).toBe(200);
  const token = tokenOf(res.data.threadUrl);
  const row = await one<{ id: string }>('SELECT id FROM inquiries WHERE thread_token = ?', token);
  return { token, id: row!.id, data: res.data };
}

beforeAll(async () => {
  await setupTestPlatform();
  installFetchMock();
  for (const id of ['pro1', 'pro2', 'client', 'free1', 'prem1', 'free2']) await createUser(id);
  for (const id of ['pro1', 'pro2', 'free1', 'prem1', 'free2']) await createProfile(id);
});
afterAll(teardownTestPlatform);

describe('two-way quotation requests', () => {
  it('gives the client a private conversation link and says whether replies will be emailed', async () => {
    const withEmail = await request('pro-pro1');
    expect(withEmail.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(withEmail.data.emailReplies).toBe(true);
    const withPhone = await request('pro-pro1', '0917 555 1234');
    expect(withPhone.data.emailReplies).toBe(false);
  });

  it('lets the professional reply, emails the client, and shows it on the client page', async () => {
    const { token, id } = await request('pro-pro1');
    outbound.emails.length = 0;
    const res = await call(proReply, { as: 'pro1', body: { body: 'Hello! Can we visit the site on Monday?' }, params: { id } });
    expect(res.status).toBe(200);
    expect(res.data.emailed).toBe(true);
    expect(outbound.emails.some((e) => e.to.includes('client@example.com'))).toBe(true);
    const thread = await getThreadByToken(token);
    expect(thread?.messages.map((m) => [m.sender, m.body])).toEqual([['pro', 'Hello! Can we visit the site on Monday?']]);
    expect(await one('SELECT status FROM inquiries WHERE id = ?', id)).toEqual({ status: 'read' });
  });

  it('lets the client answer through the link, which reopens the request and emails the professional', async () => {
    const { token, id } = await request('pro-pro1');
    await call(proReply, { as: 'pro1', body: { body: 'Noted.' }, params: { id } });
    outbound.emails.length = 0;
    const res = await call(clientReply, { body: { body: 'Monday works, thank you.' }, params: { token }, headers: fromNewIp() });
    expect(res.status).toBe(200);
    expect(await one('SELECT status FROM inquiries WHERE id = ?', id)).toEqual({ status: 'new' });
    expect(outbound.emails.some((e) => e.to.includes('pro1@tibay.test'))).toBe(true);
    expect((await getThreadByToken(token))?.messages.map((m) => m.sender)).toEqual(['pro', 'client']);
  });

  it('never lets another professional or a wrong token into a conversation', async () => {
    const { id } = await request('pro-pro1');
    expect((await call(proReply, { as: 'pro2', body: { body: 'Not mine' }, params: { id } })).status).toBe(404);
    expect((await call(clientReply, { body: { body: 'Guess' }, params: { token: 'A'.repeat(43) }, headers: fromNewIp() })).status).toBe(404);
    expect((await call(clientReply, { body: { body: 'Guess' }, params: { token: "' OR 1=1 --" }, headers: fromNewIp() })).status).toBe(404);
    expect(await count('SELECT COUNT(*) AS n FROM inquiry_messages WHERE inquiry_id = ?', id)).toBe(0);
  });

  it('creates a link for an old request on the first reply', async () => {
    await env.DB.prepare("INSERT INTO inquiries (id, profile_id, name, contact, message) VALUES ('legacy', 'profile-pro1', 'Old Client', 'old@example.com', 'Old request')").run();
    const res = await call(proReply, { as: 'pro1', body: { body: 'Sorry for the late reply' }, params: { id: 'legacy' } });
    expect(res.status).toBe(200);
    const token = (await one<{ thread_token: string }>("SELECT thread_token FROM inquiries WHERE id = 'legacy'"))!.thread_token;
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(res.data.threadUrl).toContain(token);
  });

  it('stops replies once the professional is suspended', async () => {
    const { token } = await request('pro-pro2');
    await env.DB.prepare("UPDATE profiles SET status = 'suspended' WHERE id = 'profile-pro2'").run();
    expect((await call(clientReply, { body: { body: 'Hello?' }, params: { token }, headers: fromNewIp() })).status).toBe(410);
    await env.DB.prepare("UPDATE profiles SET status = 'active' WHERE id = 'profile-pro2'").run();
  });

  it('caps the length of one conversation', async () => {
    const { id } = await request('pro-pro2');
    const stmt = env.DB.prepare("INSERT INTO inquiry_messages (id, inquiry_id, sender, body) VALUES (?, ?, 'client', 'x')");
    await env.DB.batch(Array.from({ length: MAX_THREAD_MESSAGES }, (_, i) => stmt.bind(`cap-${i}`, id)));
    const res = await call(proReply, { as: 'pro2', body: { body: 'One more' }, params: { id } });
    expect(res.status).toBe(409);
  });

  it('lists requests a signed-in member sent, with unread replies', async () => {
    const { token, id } = await request('pro-pro1', '0917 000 1111', 'client');
    expect((await listSentRequests('client')).map((r) => r.id)).toContain(id);
    expect(await countUnreadSentRequests('client')).toBe(0);
    await call(proReply, { as: 'pro1', body: { body: 'Got it' }, params: { id } });
    expect(await countUnreadSentRequests('client')).toBe(1);
    expect((await listSentRequests('client')).find((r) => r.id === id)?.unread).toBe(true);
    const thread = await getThreadByToken(token);
    await markClientRead(thread!.inquiry.id);
    expect(await countUnreadSentRequests('client')).toBe(0);
  });

  it('keeps an active conversation past the retention window of its first message', async () => {
    const { id } = await request('pro-pro1');
    const old = Date.now() - 200 * 86_400_000;
    await env.DB.prepare('UPDATE inquiries SET created_at = ?, last_message_at = ? WHERE id = ?').bind(old, Date.now(), id).run();
    await env.DB.prepare("INSERT INTO inquiries (id, profile_id, name, contact, message, created_at, last_message_at) VALUES ('stale', 'profile-pro1', 'X', 'x', 'stale', ?, ?)").bind(old, old).run();
    await runDailyMaintenance();
    expect(await count('SELECT COUNT(*) AS n FROM inquiries WHERE id = ?', id)).toBe(1);
    expect(await count("SELECT COUNT(*) AS n FROM inquiries WHERE id = 'stale'")).toBe(0);
  });
});

describe('Premium ranking', () => {
  it('lists Premium profiles first in the directory and marks them', async () => {
    // free2 was updated most recently, yet Premium still leads.
    await env.DB.prepare("UPDATE profiles SET updated_at = ? WHERE id = 'profile-free2'").bind(Date.now() + 60_000).run();
    await setSubscription('prem1', { endsInDays: 30 });
    const { results } = await searchDirectory({ page: 1 });
    expect(results[0]?.username).toBe('pro-prem1');
    expect(results[0]?.isPremium).toBe(true);
    expect(results.find((r) => r.username === 'pro-free2')?.isPremium).toBe(false);
  });

  it('stops ranking a lapsed Premium immediately', async () => {
    await setSubscription('prem1', { endsInDays: -1 });
    const { results } = await searchDirectory({ page: 1 });
    expect(results.find((r) => r.username === 'pro-prem1')?.isPremium).toBe(false);
    expect(results[0]?.username).toBe('pro-free2');
    await setSubscription('prem1', { endsInDays: 30 });
  });

  it('pins recent Premium posts above the first page of the feed without repeating them', async () => {
    const post = async (as: string, body: string) => String((await call(createPost, { as, body: { kind: 'update', body, projectId: null } })).data.id);
    const premiumPost = await post('prem1', 'Premium site update');
    const freePost = await post('free1', 'Newer free update');
    const first = await getFeed({}, null);
    expect(first.featured.map((p) => p.id)).toEqual([premiumPost]);
    expect(first.featured[0]?.featured).toBe(true);
    expect(first.posts.map((p) => p.id)).toContain(freePost);
    expect(first.posts.map((p) => p.id)).not.toContain(premiumPost);
    // Filters apply to the pinned posts too.
    expect((await getFeed({ kind: 'hiring' }, null)).featured).toEqual([]);
    // Later pages are purely chronological.
    expect((await getFeed({ before: Date.now() + 1000 }, null)).featured).toEqual([]);
    // Older Premium posts are not pinned.
    await env.DB.prepare('UPDATE posts SET created_at = ? WHERE id = ?').bind(Date.now() - 5 * 86_400_000, premiumPost).run();
    expect((await getFeed({}, null)).featured).toEqual([]);
  });
});
