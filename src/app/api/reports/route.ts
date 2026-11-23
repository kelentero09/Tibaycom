import { eq } from 'drizzle-orm';
import { reportSchema } from '@/lib/validation';
import { getDb, newId, schema } from '@/server/db';
import { ApiError, parseBody, route, verifyTurnstile } from '@/server/http';

export const POST = route({ access: 'public', limit: { name: 'report', max: 5, windowSeconds: 3600 } }, async ({ request, ip }) => {
  const input = await parseBody(request, reportSchema);
  await verifyTurnstile(input.turnstileToken, ip);
  const db = getDb();
  const profile = await db.select({ id: schema.profiles.id }).from(schema.profiles).where(eq(schema.profiles.username, input.username)).get();
  if (!profile) throw new ApiError(404, 'Profile not found.');
  await db.insert(schema.reports).values({ id: newId(), profileId: profile.id, reason: input.reason, details: input.details, reporterEmail: input.reporterEmail });
  return { ok: true };
});
