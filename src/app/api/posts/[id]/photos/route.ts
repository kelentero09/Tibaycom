import { and, eq, sql } from 'drizzle-orm';
import { PHOTOS_PER_POST } from '@/lib/plans';
import { getDb, newId, schema } from '@/server/db';
import { ApiError, route } from '@/server/http';
import { requireOwnProfile } from '@/server/profiles';
import { deleteImages, imageUrl, putImage, readImageBody } from '@/server/storage';

const { posts } = schema;
const limitMessage = `A post can have up to ${PHOTOS_PER_POST} photos.`;

export const POST = route<'user', { id: string }>({ access: 'user', limit: { name: 'upload', max: 60, windowSeconds: 3600 } }, async ({ request, user, params }) => {
  const profile = await requireOwnProfile(user.id);
  const db = getDb();
  const post = await db.select({ id: posts.id }).from(posts).where(and(eq(posts.id, params.id), eq(posts.profileId, profile.id))).get();
  if (!post) throw new ApiError(404, 'Post not found.');

  const counts = await db.get<{ n: number }>(sql`SELECT COUNT(*) AS n FROM post_photos WHERE post_id = ${post.id}`);
  if ((counts?.n ?? 0) >= PHOTOS_PER_POST) throw new ApiError(400, limitMessage, 'too_many_photos');

  const bytes = await readImageBody(request);
  const key = await putImage(user.id, 'post', bytes);
  const id = newId();
  const now = Date.now();
  // Guarded insert: parallel uploads can never exceed the per-post maximum.
  const inserted = await db.all<{ id: string }>(sql`
    INSERT INTO post_photos (id, post_id, profile_id, key, size_bytes, sort_order, created_at)
    SELECT ${id}, ${post.id}, ${profile.id}, ${key}, ${bytes.byteLength}, ${now}, ${now}
    WHERE (SELECT COUNT(*) FROM post_photos WHERE post_id = ${post.id}) < ${PHOTOS_PER_POST}
    RETURNING id`);
  if (!inserted.length) {
    await deleteImages([key]);
    throw new ApiError(400, limitMessage, 'too_many_photos');
  }
  return { id, url: imageUrl(key) };
});
