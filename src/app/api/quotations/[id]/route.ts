import { quotationInputSchema } from '@/lib/quotation';
import { parseBody, route } from '@/server/http';
import { deleteQuotation, updateQuotation } from '@/server/quotations';

export const PATCH = route<'user', { id: string }>({ access: 'user', limit: { name: 'quotation-write', max: 120, windowSeconds: 3600 } }, async ({ request, user, params }) => {
  const input = await parseBody(request, quotationInputSchema, 200_000);
  await updateQuotation(user.id, params.id, input);
});

export const DELETE = route<'user', { id: string }>({ access: 'user' }, async ({ user, params }) => {
  await deleteQuotation(user.id, params.id);
});
