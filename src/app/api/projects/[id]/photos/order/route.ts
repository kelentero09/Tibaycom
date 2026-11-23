import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { getDb, schema } from '@/server/db';
import { ApiError, parseBody, route } from '@/server/http';
import { requireOwnProfile } from '@/server/profiles';

const { projects, projectPhotos } = schema;
const body = z.object({ photoIds: z.array(z.string().min(1).max(64)).min(1).max(50) });

/**
 * Sets the display order of a project's photos. The FIRST photo is the project's cover image.
 * The submitted list must be exactly the project's current photos (no foreign ids, none missing).
 */
export const PUT = route<'user', { id: string }>({ access: 'user', limit: { name: 'project-write', max: 300, windowSeconds: 3600 } }, async ({ request, user, params }) => {
  const { photoIds } = await parseBody(request, body);
  const profile = await requireOwnProfile(user.id);
  const db = getDb();
  const project = await db.select({ id: projects.id }).from(projects).where(and(eq(projects.id, params.id), eq(projects.profileId, profile.id))).get();
  if (!project) throw new ApiError(404, 'Project not found.');

  const existing = await db.select({ id: projectPhotos.id }).from(projectPhotos).where(eq(projectPhotos.projectId, project.id));
  const known = new Set(existing.map((p) => p.id));
  if (new Set(photoIds).size !== photoIds.length || photoIds.length !== known.size || !photoIds.every((id) => known.has(id)))
    throw new ApiError(409, 'The photo list is out of date. Reload and try again.');

  const updates = photoIds.map((id, index) => db.update(projectPhotos).set({ sortOrder: index }).where(and(eq(projectPhotos.id, id), eq(projectPhotos.projectId, project.id))));
  await db.batch(updates as never);
  await db.update(projects).set({ updatedAt: new Date() }).where(eq(projects.id, project.id));
});
