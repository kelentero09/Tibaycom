import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { getDb, schema } from '@/server/db';
import { getEntitlements } from '@/server/entitlements';
import { ApiError, route } from '@/server/http';
import { requireOwnProfile } from '@/server/profiles';
import { deleteImages, imageUrl, putImage, readImageBody } from '@/server/storage';

const kindSchema = z.enum(['avatar', 'logo', 'cover']);
const column = { avatar: 'avatarKey', logo: 'logoKey', cover: 'coverKey' } as const;

function kindFrom(request: Request) {
  const parsed = kindSchema.safeParse(new URL(request.url).searchParams.get('kind'));
  if (!parsed.success) throw new ApiError(400, 'Unknown image type.');
  return parsed.data;
}

export const PUT = route({ access: 'user', limit: { name: 'upload', max: 60, windowSeconds: 3600 } }, async ({ request, user }) => {
  const kind = kindFrom(request);
  const profile = await requireOwnProfile(user.id);
  if (kind === 'cover' && !(await getEntitlements(user.id)).limits.customCoverPhoto)
    throw new ApiError(402, 'Custom cover photos are a Premium feature.', 'upgrade_required');

  const key = await putImage(user.id, kind, await readImageBody(request));
  const previous = profile[column[kind]];
  await getDb().update(schema.profiles).set({ [column[kind]]: key, updatedAt: new Date() }).where(eq(schema.profiles.id, profile.id));
  await deleteImages([previous]);
  return { url: imageUrl(key) };
});

export const DELETE = route({ access: 'user', limit: { name: 'image-delete', max: 30, windowSeconds: 600 } }, async ({ request, user }) => {
  const kind = kindFrom(request);
  const profile = await requireOwnProfile(user.id);
  await getDb().update(schema.profiles).set({ [column[kind]]: null, updatedAt: new Date() }).where(eq(schema.profiles.id, profile.id));
  await deleteImages([profile[column[kind]]]);
  return { ok: true };
});
