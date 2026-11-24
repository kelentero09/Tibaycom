import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { authMock, call, count, createProfile, createUser, env, installFetchMock, one, PNG, setSubscription, setupTestPlatform, teardownTestPlatform } from './harness';

vi.mock('@/server/auth', () => authMock());

import { POST as adminAction } from '@/app/api/admin/actions/[action]/route';
import { DELETE as deleteComment } from '@/app/api/comments/[id]/route';
import { GET as listNotificationsRoute } from '@/app/api/notifications/route';
import { POST as markRead } from '@/app/api/notifications/read/route';
import { POST as addComment } from '@/app/api/posts/[id]/comments/route';
import { DELETE as unheart, POST as heart } from '@/app/api/posts/[id]/heart/route';
import { POST as uploadPostPhoto } from '@/app/api/posts/[id]/photos/route';
import { DELETE as deletePost } from '@/app/api/posts/[id]/route';
import { POST as createPost } from '@/app/api/posts/route';
import { POST as reportContent } from '@/app/api/reports/content/route';
import { getFeed, getPost, listComments } from '@/server/community';
import { cleanupOrphanedImages } from '@/server/maintenance';

const post = (body = 'Finished the slab today in Argao.') => ({ kind: 'update', body });
const newPost = async (as: string, body?: string) => {
  const response = await call(createPost, { as, body: post(body) });
  expect(response.status).toBe(200);
  return response.data.id as string;
};

beforeAll(async () => {
  await setupTestPlatform();
  installFetchMock();
  for (const id of ['ana', 'ben', 'cid', 'dan', 'eve']) {
    await createUser(id);
    await createProfile(id);
  }
  await createUser('nop'); // signed in, no profile
  await createUser('admin', { role: 'admin', twoFactor: true });
  await setSubscription('ben', { endsInDays: 30 });
});
afterAll(teardownTestPlatform);

/** Every post on the first page, pinned or not. */
const feedIds = async () => {
  const f = await getFeed({}, null);
  return [...f.featured, ...f.posts].map((p) => p.id);
};

describe('posting limits', () => {
  it('allows 3 posts a day on Free and refuses the 4th with 402', async () => {
    for (let i = 0; i < 3; i++) await newPost('ana', `Post number ${i + 1}`);
    const fourth = await call(createPost, { as: 'ana', body: post('One too many') });
    expect(fourth.status).toBe(402);
    expect(fourth.data.code).toBe('limit_reached');
    expect(await count("SELECT COUNT(*) AS n FROM posts WHERE profile_id = 'profile-ana'")).toBe(3);
  });

  it('lets Premium post without a daily limit', async () => {
    for (let i = 0; i < 5; i++) await newPost('ben', `Premium post ${i + 1}`);
    expect(await count("SELECT COUNT(*) AS n FROM posts WHERE profile_id = 'profile-ben'")).toBe(5);
  });

  it('requires a profile and a valid body, and refuses someone else’s project', async () => {
    expect((await call(createPost, { as: 'nop', body: post() })).status).toBe(409);
    expect((await call(createPost, { body: post() })).status).toBe(401);
    expect((await call(createPost, { as: 'cid', body: { kind: 'nonsense', body: 'x' } })).status).toBe(422);
    await env.DB.prepare("INSERT INTO projects (id, profile_id, title, created_at, updated_at) VALUES ('proj-dan', 'profile-dan', 'House', 0, 0)").run();
    expect((await call(createPost, { as: 'cid', body: { ...post(), projectId: 'proj-dan' } })).status).toBe(404);
    expect((await call(createPost, { as: 'dan', body: { ...post(), projectId: 'proj-dan' } })).status).toBe(200);
  });

  it('copies the author’s location onto the post', async () => {
    const id = await newPost('cid');
    expect(await one('SELECT province, city FROM posts WHERE id = ?', id)).toEqual({ province: 'Cebu', city: 'Argao' });
  });
});

describe('hearts', () => {
  it('is idempotent and keeps heart_count equal to the real number of hearts', async () => {
    const id = await newPost('cid', 'Heart me');
    for (let i = 0; i < 3; i++) expect((await call(heart, { as: 'dan', params: { id } })).data).toMatchObject({ hearted: true, heartCount: 1 });
    expect((await call(heart, { as: 'eve', params: { id } })).data.heartCount).toBe(2);
    expect((await call(unheart, { as: 'dan', method: 'DELETE', params: { id } })).data).toMatchObject({ hearted: false, heartCount: 1 });
    expect((await call(unheart, { as: 'dan', method: 'DELETE', params: { id } })).data.heartCount).toBe(1);
    expect(await count('SELECT heart_count AS n FROM posts WHERE id = ?', id)).toBe(1);
    expect(await count('SELECT COUNT(*) AS n FROM post_hearts WHERE post_id = ?', id)).toBe(1);
  });

  it('notifies the author once per person, never for their own heart', async () => {
    const id = await newPost('dan', 'Notify me');
    await call(heart, { as: 'dan', params: { id } }); // own post
    await call(heart, { as: 'eve', params: { id } });
    await call(unheart, { as: 'eve', method: 'DELETE', params: { id } });
    await call(heart, { as: 'eve', params: { id } });
    expect(await count("SELECT COUNT(*) AS n FROM notifications WHERE post_id = ? AND type = 'heart'", id)).toBe(1);
    expect(await count("SELECT COUNT(*) AS n FROM notifications WHERE post_id = ? AND user_id = 'eve'", id)).toBe(0);
  });

  it('cannot heart a missing or hidden post', async () => {
    expect((await call(heart, { as: 'eve', params: { id: 'missing' } })).status).toBe(404);
  });
});

describe('comments and notifications', () => {
  it('counts comments, notifies the author, and not yourself', async () => {
    const id = await newPost('eve', 'Comment on this');
    expect((await call(addComment, { as: 'cid', body: { body: 'Nice work!' }, params: { id } })).status).toBe(200);
    expect((await call(addComment, { as: 'eve', body: { body: 'Thanks!' }, params: { id } })).status).toBe(200);
    expect(await count('SELECT comment_count AS n FROM posts WHERE id = ?', id)).toBe(2);
    expect(await count("SELECT COUNT(*) AS n FROM notifications WHERE post_id = ? AND type = 'comment'", id)).toBe(1);
    expect((await listComments(id)).map((c) => c.body)).toEqual(['Nice work!', 'Thanks!']);

    const list = await call(listNotificationsRoute, { as: 'eve', method: 'GET' });
    expect(list.status).toBe(200);
    expect((list.data.unread as number) > 0).toBe(true);
    await call(markRead, { as: 'eve' });
    expect((await call(listNotificationsRoute, { as: 'eve', method: 'GET' })).data.unread).toBe(0);
  });

  it('lets the comment author or the post author delete a comment, nobody else', async () => {
    const id = await newPost('cid', 'Delete test');
    const first = (await call(addComment, { as: 'dan', body: { body: 'First' }, params: { id } })).data.id as string;
    const second = (await call(addComment, { as: 'dan', body: { body: 'Second' }, params: { id } })).data.id as string;
    expect((await call(deleteComment, { as: 'eve', method: 'DELETE', params: { id: first } })).status).toBe(404);
    expect((await call(deleteComment, { as: 'dan', method: 'DELETE', params: { id: first } })).status).toBe(200); // comment author
    expect((await call(deleteComment, { as: 'cid', method: 'DELETE', params: { id: second } })).status).toBe(200); // post author
    expect(await count('SELECT comment_count AS n FROM posts WHERE id = ?', id)).toBe(0);
  });
});

describe('ownership and moderation', () => {
  it('only the author can delete a post or add photos to it', async () => {
    const id = await newPost('dan', 'Mine');
    expect((await call(deletePost, { as: 'eve', method: 'DELETE', params: { id } })).status).toBe(404);
    expect((await call(uploadPostPhoto, { as: 'eve', raw: PNG, params: { id } })).status).toBe(404);
    const photo = await call(uploadPostPhoto, { as: 'dan', raw: PNG, params: { id } });
    expect(photo.status).toBe(200);
    const key = (await one<{ key: string }>('SELECT key FROM post_photos WHERE post_id = ?', id))!.key;
    expect(key.startsWith('post/dan/')).toBe(true);
    expect((await call(deletePost, { as: 'dan', method: 'DELETE', params: { id } })).status).toBe(200);
    expect(await count('SELECT COUNT(*) AS n FROM posts WHERE id = ?', id)).toBe(0);
    expect(await env.BUCKET.get(key)).toBeNull();
  });

  it('caps photos per post at 4', async () => {
    const id = await newPost('ben', 'Photos');
    for (let i = 0; i < 4; i++) expect((await call(uploadPostPhoto, { as: 'ben', raw: PNG, params: { id } })).status).toBe(200);
    expect((await call(uploadPostPhoto, { as: 'ben', raw: PNG, params: { id } })).status).toBe(400);
    expect(await count('SELECT COUNT(*) AS n FROM post_photos WHERE post_id = ?', id)).toBe(4);
  });

  it('keeps post photos when cleaning orphaned images', async () => {
    const before = await count('SELECT COUNT(*) AS n FROM post_photos');
    await env.DB.prepare("UPDATE settings SET value = '\"\"' WHERE key = 'r2_cleanup_cursor'").run();
    // Uploads are younger than the grace period, so pretend time has passed.
    const now = Date.now();
    vi.spyOn(Date, 'now').mockReturnValue(now + 2 * 86_400_000);
    try {
      await cleanupOrphanedImages();
    } finally {
      vi.restoreAllMocks();
    }
    const keys = await env.DB.prepare('SELECT key FROM post_photos').all<{ key: string }>();
    expect(keys.results.length).toBe(before);
    for (const { key } of keys.results) expect(await env.BUCKET.head(key)).not.toBeNull();
  });

  it('hides posts from the feed when an admin hides them, and restores them', async () => {
    const id = await newPost('eve', 'Spammy post');
    expect((await feedIds()).includes(id)).toBe(true);
    expect((await call(adminAction, { as: 'admin', body: { postId: id }, params: { action: 'post.hide' } })).status).toBe(200);
    expect((await feedIds()).includes(id)).toBe(false);
    expect(await getPost(id, null)).toBeNull();
    expect((await call(heart, { as: 'dan', params: { id } })).status).toBe(404);
    expect((await call(adminAction, { as: 'admin', body: { postId: id }, params: { action: 'post.restore' } })).status).toBe(200);
    expect(await getPost(id, null)).not.toBeNull();
  });

  it('excludes posts by suspended profiles and banned users', async () => {
    await createUser('zed');
    await createProfile('zed');
    const id = await newPost('zed', 'Soon banned');
    await env.DB.prepare("UPDATE user SET banned = 1 WHERE id = 'zed'").run();
    expect(await getPost(id, null)).toBeNull();
    await env.DB.prepare("UPDATE user SET banned = 0 WHERE id = 'zed'").run();
    await env.DB.prepare("UPDATE profiles SET status = 'suspended' WHERE id = 'profile-zed'").run();
    expect(await getPost(id, null)).toBeNull();
  });

  it('files content reports against the author and lets admins hide comments', async () => {
    const id = await newPost('ben', 'Report target'); // ben is Premium; the Free authors used today's quota above
    const commentId = (await call(addComment, { as: 'dan', body: { body: 'Rude comment' }, params: { id } })).data.id as string;
    expect((await call(reportContent, { as: 'eve', body: { postId: id, commentId, reason: 'inappropriate', details: '' } })).status).toBe(200);
    expect(await one('SELECT profile_id AS profileId, post_id AS postId FROM reports WHERE comment_id = ?', commentId)).toEqual({ profileId: 'profile-dan', postId: id });
    expect((await call(adminAction, { as: 'admin', body: { commentId }, params: { action: 'comment.hide' } })).status).toBe(200);
    expect((await listComments(id)).length).toBe(0);
    expect(await count('SELECT comment_count AS n FROM posts WHERE id = ?', id)).toBe(0);
  });

  it('paginates the feed by cursor without repeats', async () => {
    const first = await getFeed({}, null);
    const seen = new Set(first.posts.map((p) => p.id));
    if (first.nextBefore) {
      const second = await getFeed({ before: first.nextBefore }, null);
      for (const p of second.posts) expect(seen.has(p.id)).toBe(false);
    }
    expect(first.posts.length).toBeLessThanOrEqual(20);
  });
});
