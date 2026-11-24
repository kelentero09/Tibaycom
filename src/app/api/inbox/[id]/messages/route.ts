import { inquiryReplySchema } from '@/lib/validation';
import { parseBody, route } from '@/server/http';
import { replyAsPro } from '@/server/inquiries';
import { requireOwnProfile } from '@/server/profiles';

/** Professional replies to a quotation request in their inbox. Ownership is checked inside replyAsPro. */
export const POST = route<'user', { id: string }>({ access: 'user', limit: { name: 'inbox-reply', max: 60, windowSeconds: 3600 } }, async ({ request, user, params }) => {
  const { body } = await parseBody(request, inquiryReplySchema);
  const profile = await requireOwnProfile(user.id);
  return replyAsPro(profile.id, params.id, body);
});
