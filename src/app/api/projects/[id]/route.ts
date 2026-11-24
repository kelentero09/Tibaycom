import { and, eq } from 'drizzle-orm';
import { projectSchema } from '@/lib/validation';
import { getDb, schema } from '@/server/db';
import { ApiError, parseBody, route } from '@/server/http';
import { requireOwnProfile } from '@/server/profiles';
import { deleteImages } from '@/server/storage';

const { projects, projectPhotos } = schema;

/** Ownership is part of the WHERE clause: another user's project id simply matches nothing (no IDOR). */
const owned = (id: string, profileId: string) => and(eq(projects.id, id), eq(projects.profileId, profileId));

export const PATCH = route<'user', { id: string }>({ access: 'user', limit: { name: 'project-write', max: 60, windowSeconds: 3600 } }, async ({ request, user, params }) => {
  const input = await parseBody(request, projectSchema);
  const profile = await requireOwnProfile(user.id);
  const updated = await getDb().update(projects).set({ ...input, updatedAt: new Date() }).where(owned(params.id, profile.id)).returning({ id: projects.id });
  if (!updated.length) throw new ApiError(404, 'Project not found.');
  return { ok: true };
});

export const DELETE = route<'user', { id: string }>({ access: 'user', limit: { name: 'project-delete', max: 30, windowSeconds: 600 } }, async ({ user, params }) => {
  const profile = await requireOwnProfile(user.id);
  const db = getDb();
  const project = await db.select({ id: projects.id }).from(projects).where(owned(params.id, profile.id)).get();
  if (!project) throw new ApiError(404, 'Project not found.');
  const photos = await db.select({ key: projectPhotos.key }).from(projectPhotos).where(eq(projectPhotos.projectId, project.id));
  await db.delete(projects).where(eq(projects.id, project.id)); // photo rows cascade
  await deleteImages(photos.map((p) => p.key));
  return { ok: true };
});
