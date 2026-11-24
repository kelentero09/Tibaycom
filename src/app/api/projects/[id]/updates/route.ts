import { and, eq, sql } from 'drizzle-orm';
import { projectUpdateSchema } from '@/lib/validation';
import { getDb, newId, schema } from '@/server/db';
import { getEntitlements } from '@/server/entitlements';
import { ApiError, parseBody, route } from '@/server/http';
import { requireOwnProfile } from '@/server/profiles';

/** Adds a progress update to one of the caller's projects (timeline). Limit check and insert are one statement. */
export const POST = route<'user', { id: string }>({ access: 'user', limit: { name: 'project-update-write', max: 60, windowSeconds: 3600 } }, async ({ request, user, params }) => {
  const input = await parseBody(request, projectUpdateSchema);
  const [profile, entitlements] = await Promise.all([requireOwnProfile(user.id), getEntitlements(user.id)]);
  const db = getDb();
  const project = await db
    .select({ id: schema.projects.id })
    .from(schema.projects)
    .where(and(eq(schema.projects.id, params.id), eq(schema.projects.profileId, profile.id)))
    .get();
  if (!project) throw new ApiError(404, 'Project not found.');
  if (input.photoId) {
    const photo = await db
      .select({ id: schema.projectPhotos.id })
      .from(schema.projectPhotos)
      .where(and(eq(schema.projectPhotos.id, input.photoId), eq(schema.projectPhotos.projectId, project.id)))
      .get();
    if (!photo) throw new ApiError(422, 'Choose a photo from this project.');
  }
  const id = newId();
  const now = Date.now();
  const limit = entitlements.limits.updatesPerProject;
  const inserted = await db.all<{ id: string }>(sql`
    INSERT INTO project_updates (id, project_id, profile_id, date, title, body, photo_id, created_at, updated_at)
    SELECT ${id}, ${project.id}, ${profile.id}, ${input.date}, ${input.title}, ${input.body}, ${input.photoId}, ${now}, ${now}
    WHERE (SELECT COUNT(*) FROM project_updates WHERE project_id = ${project.id}) < ${limit}
    RETURNING id`);
  if (!inserted.length)
    throw new ApiError(402, `Your ${entitlements.plan === 'premium' ? 'Premium' : 'Free'} plan allows ${limit} timeline updates per project.`, 'limit_reached');
  return { id };
});
