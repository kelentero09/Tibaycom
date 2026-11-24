import { route } from '@/server/http';
import { deleteOwnReview } from '@/server/reviews';

/** The author removes their own review. */
export const DELETE = route<'user', { id: string }>({ access: 'user', limit: { name: 'review-delete', max: 20, windowSeconds: 3600 } }, async ({ user, params }) => {
  await deleteOwnReview(params.id, user.id);
  return { ok: true };
});
