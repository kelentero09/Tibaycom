import { route } from '@/server/http';
import { duplicateQuotation } from '@/server/quotations';

export const POST = route<'user', { id: string }>({ access: 'user', limit: { name: 'quotation-write', max: 120, windowSeconds: 3600 } }, async ({ user, params }) =>
  duplicateQuotation(user.id, params.id),
);
