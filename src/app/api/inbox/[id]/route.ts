import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { getDb, schema } from '@/server/db';
import { ApiError, parseBody, route } from '@/server/http';
import { requireOwnProfile } from '@/server/profiles';

const { inquiries } = schema;
const body = z.object({ status: z.enum(['new', 'read', 'archived']) });

/** Ownership is part of the WHERE clause — an inquiry id from another profile matches nothing. */
const owned = (id: string, profileId: string) => and(eq(inquiries.id, id), eq(inquiries.profileId, profileId));

export const PATCH = route<'user', { id: string }>({ access: 'user', limit: { name: 'inbox-write', max: 300, windowSeconds: 3600 } }, async ({ request, user, params }) => {
  const { status } = await parseBody(request, body);
  const profile = await requireOwnProfile(user.id);
  const updated = await getDb().update(inquiries).set({ status }).where(owned(params.id, profile.id)).returning({ id: inquiries.id });
  if (!updated.length) throw new ApiError(404, 'Request not found.');
});

export const DELETE = route<'user', { id: string }>({ access: 'user', limit: { name: 'inbox-write', max: 300, windowSeconds: 3600 } }, async ({ user, params }) => {
  const profile = await requireOwnProfile(user.id);
  const deleted = await getDb().delete(inquiries).where(owned(params.id, profile.id)).returning({ id: inquiries.id });
  if (!deleted.length) throw new ApiError(404, 'Request not found.');
});
