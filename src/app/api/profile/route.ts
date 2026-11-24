import { eq } from 'drizzle-orm';
import { onboardingSchema, profileUpdateSchema } from '@/lib/validation';
import { getDb, newId, schema } from '@/server/db';
import { ApiError, parseBody, route } from '@/server/http';
import { getProfileByUserId, requireOwnProfile, tagStatements } from '@/server/profiles';

const { profiles } = schema;

/** Onboarding: create the caller's single profile. */
export const POST = route({ access: 'user', limit: { name: 'profile-create', max: 10, windowSeconds: 3600 } }, async ({ request, user }) => {
  const input = await parseBody(request, onboardingSchema);
  const db = getDb();
  if (await getProfileByUserId(user.id)) throw new ApiError(409, 'You already have a profile.');
  const taken = await db.select({ id: profiles.id }).from(profiles).where(eq(profiles.username, input.username)).get();
  if (taken) throw new ApiError(409, 'That username is already taken.', 'username_taken');

  const id = newId();
  try {
    await db.batch([
      db.insert(profiles).values({
        id,
        userId: user.id,
        username: input.username,
        intent: input.intent,
        businessName: input.businessName,
        province: input.province,
        city: input.city,
        contactEmail: user.email,
      }),
      ...tagStatements(id, input.professions, []).slice(2),
    ] as never);
  } catch {
    // Unique constraints are the final arbiter if two requests race.
    throw new ApiError(409, 'That username is already taken.', 'username_taken');
  }
  return { username: input.username };
});

export const PATCH = route({ access: 'user', limit: { name: 'profile-update', max: 60, windowSeconds: 3600 } }, async ({ request, user }) => {
  const input = await parseBody(request, profileUpdateSchema);
  const profile = await requireOwnProfile(user.id);
  const db = getDb();
  const { professions, specializations, ...fields } = input;
  await db.batch([
    db.update(profiles).set({ ...fields, updatedAt: new Date() }).where(eq(profiles.id, profile.id)),
    ...tagStatements(profile.id, professions, specializations),
  ] as never);
  return { ok: true };
});
