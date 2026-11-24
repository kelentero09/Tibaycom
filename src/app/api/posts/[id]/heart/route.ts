import { getInteractablePost } from '@/server/community';
import { getEnv, newId } from '@/server/db';
import { ApiError, route } from '@/server/http';
import { requireOwnProfile } from '@/server/profiles';

type Params = { id: string };
const limit = { name: 'heart', max: 120, windowSeconds: 600 };

/** heart_count is recomputed from post_hearts inside the same batch, so repeats and races can never skew it. */
const RECOUNT = 'UPDATE posts SET heart_count = (SELECT COUNT(*) FROM post_hearts WHERE post_id = ?1) WHERE id = ?1';
const readCount = async (postId: string) => (await getEnv().DB.prepare('SELECT heart_count AS n FROM posts WHERE id = ?').bind(postId).first<{ n: number }>())?.n ?? 0;

export const POST = route<'user', Params>({ access: 'user', limit }, async ({ user, params }) => {
  const profile = await requireOwnProfile(user.id);
  const post = await getInteractablePost(params.id);
  if (!post) throw new ApiError(404, 'Post not found.');
  const d1 = getEnv().DB;
  const now = Date.now();
  const statements = [d1.prepare('INSERT OR IGNORE INTO post_hearts (post_id, user_id, created_at) VALUES (?, ?, ?)').bind(post.id, user.id, now), d1.prepare(RECOUNT).bind(post.id)];
  // One notification per person per post: un-hearting and hearting again never pings the author twice; never notify yourself.
  if (post.authorUserId !== user.id)
    statements.push(
      d1
        .prepare(
          `INSERT INTO notifications (id, user_id, type, actor_profile_id, post_id, created_at)
           SELECT ?1, ?2, 'heart', ?3, ?4, ?5
           WHERE NOT EXISTS (SELECT 1 FROM notifications WHERE user_id = ?2 AND type = 'heart' AND actor_profile_id = ?3 AND post_id = ?4)`,
        )
        .bind(newId(), post.authorUserId, profile.id, post.id, now),
    );
  await d1.batch(statements);
  return { hearted: true, heartCount: await readCount(post.id) };
});

export const DELETE = route<'user', Params>({ access: 'user', limit }, async ({ user, params }) => {
  const d1 = getEnv().DB;
  await d1.batch([d1.prepare('DELETE FROM post_hearts WHERE post_id = ? AND user_id = ?').bind(params.id, user.id), d1.prepare(RECOUNT).bind(params.id)]);
  return { hearted: false, heartCount: await readCount(params.id) };
});
