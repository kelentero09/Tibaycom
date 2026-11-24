import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { authMock, call, count, createProfile, createUser, env, installFetchMock, one, outbound, setupTestPlatform, teardownTestPlatform } from './harness';

vi.mock('@/server/auth', () => authMock());

import { POST as sendInquiry } from '@/app/api/inquiries/[username]/route';
import { POST as writeReview } from '@/app/api/reviews/route';
import { DELETE as deleteReview } from '@/app/api/reviews/[id]/route';
import { PUT as replyReview } from '@/app/api/reviews/[id]/reply/route';
import { POST as reportReview } from '@/app/api/reviews/[id]/report/route';
import { runAdminAction } from '@/server/admin/actions';
import { searchDirectory } from '@/server/profiles';
import { getCommunityStats, getRatings, getReviewSummary, listReviews, shortName } from '@/server/reviews';

const review = (as: string, rating: number, body = 'Great work, finished on time and clean.', username = 'pro-pro') => call(writeReview, { as, body: { username, rating, body } });

beforeAll(async () => {
  await setupTestPlatform();
  installFetchMock();
  for (const id of ['pro', 'a', 'b', 'c', 'home', 'admin']) await createUser(id, id === 'admin' ? { role: 'admin', twoFactor: true } : {});
  await createProfile('pro');
  await createProfile('home', 'homeowner');
  await env.DB.prepare("UPDATE profiles SET intent = 'seeking_contractor' WHERE id = 'profile-home'").run();
});
afterAll(teardownTestPlatform);

describe('reviews', () => {
  it('averages ratings and shows them on directory cards', async () => {
    outbound.emails.length = 0;
    expect((await review('a', 5)).status).toBe(200);
    expect(outbound.emails.some((e) => e.to.includes('pro@tibay.test'))).toBe(true);
    expect((await review('b', 4)).status).toBe(200);
    const summary = await getReviewSummary('profile-pro');
    expect(summary).toMatchObject({ average: 4.5, count: 2, distribution: [0, 0, 0, 1, 1] });
    const card = (await searchDirectory({ page: 1 })).results.find((r) => r.username === 'pro-pro');
    expect(card?.rating).toEqual({ average: 4.5, count: 2 });
  });

  it('keeps one review per member: posting again edits it', async () => {
    expect((await review('b', 3, 'Updated: some delays but good result.')).status).toBe(200);
    expect(await count("SELECT COUNT(*) AS n FROM reviews WHERE author_user_id = 'b'")).toBe(1);
    expect((await getReviewSummary('profile-pro')).average).toBe(4);
  });

  it('rejects self-reviews, homeowner pages, bad ratings and empty text', async () => {
    expect((await review('pro', 5)).status).toBe(403);
    expect((await review('a', 5, 'Nice person to deal with.', 'homeowner')).status).toBe(400);
    expect((await review('c', 6)).status).toBe(422);
    expect((await review('c', 0)).status).toBe(422);
    expect((await review('c', 5, 'ok')).status).toBe(422);
    expect((await call(writeReview, { body: { username: 'pro-pro', rating: 5, body: 'Anonymous praise here.' } })).status).toBe(401);
  });

  it('marks reviews from members who contacted the professional through Tibay', async () => {
    const res = await call(sendInquiry, { as: 'c', body: { name: 'Carla Cruz', contact: 'c@example.com', message: 'Quotation please for a house.', turnstileToken: 'ok' }, params: { username: 'pro-pro' }, headers: { 'cf-connecting-ip': '203.0.113.9' } });
    expect(res.status).toBe(200);
    await review('c', 5);
    const list = await listReviews('profile-pro');
    expect(list.find((r) => r.authorUserId === 'c')?.verified).toBe(true);
    expect(list.find((r) => r.authorUserId === 'a')?.verified).toBe(false);
    // No public page: shown as "First L." only.
    expect(list.find((r) => r.authorUserId === 'a')?.authorName).toBe('User A.');
    expect(shortName('Maria Lourdes Santos')).toBe('Maria S.');
  });

  it('lets only the reviewed professional reply, and only the author delete', async () => {
    const id = (await one<{ id: string }>("SELECT id FROM reviews WHERE author_user_id = 'a'"))!.id;
    expect((await call(replyReview, { as: 'b', body: { body: 'Not mine' }, params: { id } })).status).toBe(409); // b has no profile
    expect((await call(replyReview, { as: 'pro', body: { body: 'Salamat po!' }, params: { id } })).status).toBe(200);
    expect((await one('SELECT owner_reply FROM reviews WHERE id = ?', id))).toEqual({ owner_reply: 'Salamat po!' });
    expect((await call(deleteReview, { as: 'pro', params: { id } })).status).toBe(404);
    expect((await call(deleteReview, { as: 'a', params: { id } })).status).toBe(200);
    expect(await count('SELECT COUNT(*) AS n FROM reviews WHERE id = ?', id)).toBe(0);
  });

  it('can be reported, hidden by an admin, and stops counting', async () => {
    const id = (await one<{ id: string }>("SELECT id FROM reviews WHERE author_user_id = 'b'"))!.id;
    expect((await call(reportReview, { as: 'pro', body: { reason: 'fake', details: '' }, params: { id } })).status).toBe(200);
    expect(await count("SELECT COUNT(*) AS n FROM reports WHERE review_id = ? AND profile_id = 'profile-pro'", id)).toBe(1);
    const before = (await getRatings(['profile-pro'])).get('profile-pro')?.count ?? 0;
    const admin = { id: 'admin', email: 'admin@tibay.test', role: 'admin' } as never;
    await runAdminAction('review.hide', { reviewId: id }, { admin, ip: '127.0.0.1' });
    expect((await getRatings(['profile-pro'])).get('profile-pro')?.count ?? 0).toBe(before - 1);
    expect((await listReviews('profile-pro')).some((r) => r.id === id)).toBe(false);
  });

  it('drops reviews by banned members from ratings', async () => {
    const before = (await getReviewSummary('profile-pro')).count;
    await env.DB.prepare("UPDATE user SET banned = 1 WHERE id = 'c'").run();
    expect((await getReviewSummary('profile-pro')).count).toBe(before - 1);
    await env.DB.prepare("UPDATE user SET banned = 0 WHERE id = 'c'").run();
  });

  it('reports honest community totals', async () => {
    const stats = await getCommunityStats();
    expect(stats.members).toBe(6);
    expect(stats.professionals).toBe(1); // the homeowner is not counted
  });
});
