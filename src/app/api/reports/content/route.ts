import { and, eq } from 'drizzle-orm';
import { contentReportSchema } from '@/lib/validation';
import { getDb, newId, schema } from '@/server/db';
import { ApiError, parseBody, route } from '@/server/http';

/** Signed-in members report a community post or comment. The report is filed against the content's author. */
export const POST = route({ access: 'user', limit: { name: 'report', max: 10, windowSeconds: 3600 } }, async ({ request, user }) => {
  const input = await parseBody(request, contentReportSchema);
  const db = getDb();
  const post = await db.select({ id: schema.posts.id, profileId: schema.posts.profileId }).from(schema.posts).where(eq(schema.posts.id, input.postId)).get();
  if (!post) throw new ApiError(404, 'Post not found.');
  let profileId = post.profileId;
  if (input.commentId) {
    const comment = await db
      .select({ profileId: schema.postComments.profileId })
      .from(schema.postComments)
      .where(and(eq(schema.postComments.id, input.commentId), eq(schema.postComments.postId, post.id)))
      .get();
    if (!comment) throw new ApiError(404, 'Comment not found.');
    profileId = comment.profileId;
  }
  await db.insert(schema.reports).values({ id: newId(), profileId, postId: post.id, commentId: input.commentId, reason: input.reason, details: input.details, reporterEmail: user.email });
  return { ok: true };
});
