import { COMMENTS_PER_DAY } from '@/lib/plans';
import { commentSchema } from '@/lib/validation';
import { getInteractablePost, notificationValues } from '@/server/community';
import { getEnv, newId } from '@/server/db';
import { consumeQuota, currentDay, refundQuota } from '@/server/entitlements';
import { ApiError, parseBody, route } from '@/server/http';
import { requireOwnProfile } from '@/server/profiles';

export const POST = route<'user', { id: string }>({ access: 'user', limit: { name: 'comment', max: 30, windowSeconds: 600 } }, async ({ request, user, params }) => {
  const input = await parseBody(request, commentSchema);
  const profile = await requireOwnProfile(user.id);
  const post = await getInteractablePost(params.id);
  if (!post) throw new ApiError(404, 'Post not found.');

  const day = currentDay();
  if ((await consumeQuota(user.id, 'comment', day, COMMENTS_PER_DAY)) === null)
    throw new ApiError(429, `You have reached today’s limit of ${COMMENTS_PER_DAY} comments. Try again tomorrow.`, 'comment_limit');

  const d1 = getEnv().DB;
  const id = newId();
  const now = Date.now();
  const notify = notificationValues(post.authorUserId, { userId: user.id, profileId: profile.id }, 'comment', post.id);
  try {
    await d1.batch([
      d1.prepare('INSERT INTO post_comments (id, post_id, profile_id, body, status, created_at) VALUES (?, ?, ?, ?, ?, ?)').bind(id, post.id, profile.id, input.body, 'active', now),
      d1.prepare("UPDATE posts SET comment_count = (SELECT COUNT(*) FROM post_comments WHERE post_id = ?1 AND status = 'active') WHERE id = ?1").bind(post.id),
      ...(notify
        ? [d1.prepare('INSERT INTO notifications (id, user_id, type, actor_profile_id, post_id, created_at) VALUES (?, ?, ?, ?, ?, ?)').bind(notify.id, notify.userId, notify.type, notify.actorProfileId, notify.postId, now)]
        : []),
    ]);
  } catch (error) {
    await refundQuota(user.id, 'comment', day);
    throw error;
  }
  return { id };
});
