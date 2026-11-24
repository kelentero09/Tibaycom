import { and, eq } from 'drizzle-orm';
import { postSchema } from '@/lib/validation';
import { getDb, newId, schema } from '@/server/db';
import { consumeQuota, currentDay, getEntitlements, refundQuota } from '@/server/entitlements';
import { ApiError, parseBody, route } from '@/server/http';
import { requireOwnProfile } from '@/server/profiles';

/** Creates a community post. Free plans have a daily post quota (Manila day); Premium is unlimited. */
export const POST = route({ access: 'user', limit: { name: 'post-write', max: 30, windowSeconds: 3600 } }, async ({ request, user }) => {
  const input = await parseBody(request, postSchema);
  const [profile, entitlements] = await Promise.all([requireOwnProfile(user.id), getEntitlements(user.id)]);
  const db = getDb();
  if (input.projectId) {
    const project = await db
      .select({ id: schema.projects.id })
      .from(schema.projects)
      .where(and(eq(schema.projects.id, input.projectId), eq(schema.projects.profileId, profile.id)))
      .get();
    if (!project) throw new ApiError(404, 'Project not found.');
  }

  const limit = entitlements.limits.postsPerDay;
  const day = currentDay();
  const used = await consumeQuota(user.id, 'post', day, limit);
  if (used === null)
    throw new ApiError(402, `You have shared ${limit} posts today, the most the Free plan allows. Post again tomorrow or upgrade to Premium for unlimited posts.`, 'limit_reached');

  const id = newId();
  try {
    await db.insert(schema.posts).values({ id, profileId: profile.id, kind: input.kind, body: input.body, projectId: input.projectId, province: profile.province, city: profile.city });
  } catch (error) {
    await refundQuota(user.id, 'post', day);
    throw error;
  }
  return { id };
});
