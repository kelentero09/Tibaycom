import { z } from 'zod';
import { reviewSchema } from '@/lib/validation';
import { parseBody, route } from '@/server/http';
import { upsertReview } from '@/server/reviews';

const bodySchema = reviewSchema.extend({ username: z.string().trim().min(1).max(64) });

/** Signed-in members rate a professional (1–5 stars). Sending again edits their existing review. */
export const POST = route({ access: 'user', limit: { name: 'review', max: 10, windowSeconds: 3600 } }, async ({ request, user }) => {
  const { username, rating, body } = await parseBody(request, bodySchema);
  const { review, created } = await upsertReview(username, user.id, { rating, body });
  return { ok: true, id: review.id, created };
});
