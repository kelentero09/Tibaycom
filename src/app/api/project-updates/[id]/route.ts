import { and, eq } from 'drizzle-orm';
import { projectUpdateSchema } from '@/lib/validation';
import { getDb, schema } from '@/server/db';
import { ApiError, parseBody, route } from '@/server/http';
import { requireOwnProfile } from '@/server/profiles';

const { projectUpdates, projectPhotos } = schema;

/** Ownership is part of the WHERE clause: another member's update id matches nothing. */
const owned = (id: string, profileId: string) => and(eq(projectUpdates.id, id), eq(projectUpdates.profileId, profileId));

export const PATCH = route<'user', { id: string }>({ access: 'user', limit: { name: 'project-update-write', max: 60, windowSeconds: 3600 } }, async ({ request, user, params }) => {
  const input = await parseBody(request, projectUpdateSchema);
  const profile = await requireOwnProfile(user.id);
  const db = getDb();
  const existing = await db.select({ projectId: projectUpdates.projectId }).from(projectUpdates).where(owned(params.id, profile.id)).get();
  if (!existing) throw new ApiError(404, 'Update not found.');
  if (input.photoId) {
    const photo = await db
      .select({ id: projectPhotos.id })
      .from(projectPhotos)
      .where(and(eq(projectPhotos.id, input.photoId), eq(projectPhotos.projectId, existing.projectId)))
      .get();
    if (!photo) throw new ApiError(422, 'Choose a photo from this project.');
  }
  await db.update(projectUpdates).set({ ...input, updatedAt: new Date() }).where(owned(params.id, profile.id));
  return { ok: true };
});

export const DELETE = route<'user', { id: string }>({ access: 'user', limit: { name: 'project-update-delete', max: 60, windowSeconds: 600 } }, async ({ user, params }) => {
  const profile = await requireOwnProfile(user.id);
  const deleted = await getDb().delete(projectUpdates).where(owned(params.id, profile.id)).returning({ id: projectUpdates.id });
  if (!deleted.length) throw new ApiError(404, 'Update not found.');
  return { ok: true };
});
