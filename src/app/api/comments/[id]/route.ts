import { getEnv } from '@/server/db';
import { ApiError, route } from '@/server/http';
import { requireOwnProfile } from '@/server/profiles';

/** The comment's author or the post's author may delete a comment. */
export const DELETE = route<'user', { id: string }>({ access: 'user', limit: { name: 'comment-delete', max: 60, windowSeconds: 600 } }, async ({ user, params }) => {
  const profile = await requireOwnProfile(user.id);
  const d1 = getEnv().DB;
  const comment = await d1
    .prepare('SELECT c.id, c.post_id AS postId, c.profile_id AS authorProfileId, p.profile_id AS postProfileId FROM post_comments c JOIN posts p ON p.id = c.post_id WHERE c.id = ?')
    .bind(params.id)
    .first<{ id: string; postId: string; authorProfileId: string; postProfileId: string }>();
  // Someone else's comment on someone else's post looks exactly like a missing one.
  if (!comment || (comment.authorProfileId !== profile.id && comment.postProfileId !== profile.id)) throw new ApiError(404, 'Comment not found.');
  await d1.batch([
    d1.prepare('DELETE FROM post_comments WHERE id = ?').bind(comment.id),
    d1.prepare("UPDATE posts SET comment_count = (SELECT COUNT(*) FROM post_comments WHERE post_id = ?1 AND status = 'active') WHERE id = ?1").bind(comment.postId),
  ]);
  return { ok: true };
});
