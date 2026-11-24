import { and, eq } from 'drizzle-orm';
import { getDb, schema } from '@/server/db';
import { ApiError, route } from '@/server/http';
import { requireOwnProfile } from '@/server/profiles';
import { deleteImages } from '@/server/storage';

const { projectPhotos } = schema;

export const DELETE = route<'user', { id: string }>({ access: 'user', limit: { name: 'photo-delete', max: 60, windowSeconds: 600 } }, async ({ user, params }) => {
  const profile = await requireOwnProfile(user.id);
  const deleted = await getDb()
    .delete(projectPhotos)
    .where(and(eq(projectPhotos.id, params.id), eq(projectPhotos.profileId, profile.id)))
    .returning({ key: projectPhotos.key });
  if (!deleted.length) throw new ApiError(404, 'Photo not found.');
  await deleteImages(deleted.map((d) => d.key));
  return { ok: true };
});
