import { and, eq, sql } from 'drizzle-orm';
import { IMAGE_RULES } from '@/lib/plans';
import { getDb, newId, schema } from '@/server/db';
import { getEntitlements } from '@/server/entitlements';
import { ApiError, route } from '@/server/http';
import { requireOwnProfile } from '@/server/profiles';
import { deleteImages, imageUrl, putImage, readImageBody } from '@/server/storage';

const { projects } = schema;

export const POST = route<'user', { id: string }>({ access: 'user', limit: { name: 'upload', max: 60, windowSeconds: 3600 } }, async ({ request, user, params }) => {
  const [profile, entitlements] = await Promise.all([requireOwnProfile(user.id), getEntitlements(user.id)]);
  const db = getDb();
  const project = await db.select({ id: projects.id }).from(projects).where(and(eq(projects.id, params.id), eq(projects.profileId, profile.id))).get();
  if (!project) throw new ApiError(404, 'Project not found.');

  const limitMessage = `Your ${entitlements.plan === 'premium' ? 'Premium' : 'Free'} plan allows up to ${entitlements.limits.photos} photos in total.`;
  // Cheap pre-check before accepting the upload; the insert below is the authoritative, race-safe check.
  const counts = await db.get<{ total: number; inProject: number }>(sql`
    SELECT COUNT(*) AS total, COALESCE(SUM(project_id = ${project.id}), 0) AS inProject FROM project_photos WHERE profile_id = ${profile.id}`);
  if ((counts?.total ?? 0) >= entitlements.limits.photos) throw new ApiError(402, limitMessage, 'limit_reached');
  if ((counts?.inProject ?? 0) >= IMAGE_RULES.maxPhotosPerProject) throw new ApiError(409, `A project can have up to ${IMAGE_RULES.maxPhotosPerProject} photos.`);

  const bytes = await readImageBody(request);
  const key = await putImage(user.id, 'project', bytes);
  const id = newId();
  const now = Date.now();
  const inserted = await db.all<{ id: string }>(sql`
    INSERT INTO project_photos (id, project_id, profile_id, key, size_bytes, sort_order, created_at)
    SELECT ${id}, ${project.id}, ${profile.id}, ${key}, ${bytes.byteLength}, ${now}, ${now}
    WHERE (SELECT COUNT(*) FROM project_photos WHERE profile_id = ${profile.id}) < ${entitlements.limits.photos}
    RETURNING id`);
  if (!inserted.length) {
    await deleteImages([key]);
    throw new ApiError(402, limitMessage, 'limit_reached');
  }
  return { id, url: imageUrl(key) };
});
