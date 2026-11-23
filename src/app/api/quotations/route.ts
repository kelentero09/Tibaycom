import { quotationInputSchema } from '@/lib/quotation';
import { parseBody, route } from '@/server/http';
import { requireOwnProfile } from '@/server/profiles';
import { createQuotation } from '@/server/quotations';

export const POST = route({ access: 'user', limit: { name: 'quotation-write', max: 120, windowSeconds: 3600 } }, async ({ request, user }) => {
  const input = await parseBody(request, quotationInputSchema, 200_000);
  await requireOwnProfile(user.id);
  return createQuotation(user.id, input);
});
