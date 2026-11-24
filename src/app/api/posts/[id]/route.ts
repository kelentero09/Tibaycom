import { and, eq } from 'drizzle-orm';
import { getDb, schema } from '@/server/db';
import { ApiError, route } from '@/server/http';
import { requireOwnProfile } from '@/server/profiles';
import { deleteImages } from '@/server/storage';

const { posts, postPhotos } = schema;

/** Authors delete their own posts; hearts, comments, photos rows and notifications cascade. */
export const DELETE = route<'user', { id: string }>({ access: 'user', limit: { name: 'post-delete', max: 30, windowSeconds: 600 } }, async ({ user, params }) => {
  const profile = await requireOwnProfile(user.id);
  const db = getDb();
  const post = await db.select({ id: posts.id }).from(posts).where(and(eq(posts.id, params.id), eq(posts.profileId, profile.id))).get();
  if (!post) throw new ApiError(404, 'Post not found.');
  const photos = await db.select({ key: postPhotos.key }).from(postPhotos).where(eq(postPhotos.postId, post.id));
  await db.delete(posts).where(eq(posts.id, post.id));
  await deleteImages(photos.map((p) => p.key));
  return { ok: true };
});
