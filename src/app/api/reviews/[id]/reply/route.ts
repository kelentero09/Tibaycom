import { reviewReplySchema } from '@/lib/validation';
import { parseBody, route } from '@/server/http';
import { requireOwnProfile } from '@/server/profiles';
import { replyToReview } from '@/server/reviews';

/** The reviewed professional answers a review publicly. An empty reply removes it. */
export const PUT = route<'user', { id: string }>({ access: 'user', limit: { name: 'review-reply', max: 30, windowSeconds: 3600 } }, async ({ request, user, params }) => {
  const { body } = await parseBody(request, reviewReplySchema);
  const profile = await requireOwnProfile(user.id);
  await replyToReview(params.id, profile.id, body);
  return { ok: true };
});
