import { z } from 'zod';
import { setCancelAtPeriodEnd } from '@/server/billing';
import { parseBody, route } from '@/server/http';

const schema = z.object({ cancel: z.boolean() });

export const POST = route({ access: 'user', limit: { name: 'subscription-cancel', max: 20, windowSeconds: 3600 } }, async ({ request, user, ip }) => {
  const { cancel } = await parseBody(request, schema);
  await setCancelAtPeriodEnd(user.id, cancel, ip);
});
