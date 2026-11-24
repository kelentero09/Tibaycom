import { eq } from 'drizzle-orm';
import { reviewReportSchema } from '@/lib/validation';
import { getDb, newId, schema } from '@/server/db';
import { ApiError, parseBody, route } from '@/server/http';

/** Members (including the reviewed professional) flag a fake or abusive review for the admins. */
export const POST = route<'user', { id: string }>({ access: 'user', limit: { name: 'report', max: 10, windowSeconds: 3600 } }, async ({ request, user, params }) => {
  const input = await parseBody(request, reviewReportSchema);
  const db = getDb();
  const review = await db.select({ id: schema.reviews.id, profileId: schema.reviews.profileId }).from(schema.reviews).where(eq(schema.reviews.id, params.id)).get();
  if (!review) throw new ApiError(404, 'Review not found.');
  await db.insert(schema.reports).values({ id: newId(), profileId: review.profileId, reviewId: review.id, reason: input.reason, details: input.details, reporterEmail: user.email });
  return { ok: true };
});
