import { inquiryReplySchema } from '@/lib/validation';
import { parseBody, route } from '@/server/http';
import { replyAsClient } from '@/server/inquiries';

/** Client replies through their private conversation link; the secret token is the credential. */
export const POST = route<'public', { token: string }>({ access: 'public', limit: { name: 'thread-reply', max: 20, windowSeconds: 3600 } }, async ({ request, params }) => {
  const { body } = await parseBody(request, inquiryReplySchema);
  const message = await replyAsClient(params.token, body);
  return { message };
});
