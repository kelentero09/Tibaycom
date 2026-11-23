import { z } from 'zod';
import { parseBody, route } from '@/server/http';
import { setQuotationSharing } from '@/server/quotations';

const body = z.object({ enabled: z.boolean() });

/** Turns the read-only client link on (new unguessable token) or off (old link stops working immediately). */
export const POST = route<'user', { id: string }>({ access: 'user', limit: { name: 'quotation-write', max: 120, windowSeconds: 3600 } }, async ({ request, user, params }) => {
  const { enabled } = await parseBody(request, body);
  return setQuotationSharing(user.id, params.id, enabled);
});
