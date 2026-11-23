import { z } from 'zod';
import { startCheckout } from '@/server/billing';
import { parseBody, route } from '@/server/http';

const schema = z.object({ interval: z.enum(['monthly', 'annual']) });

export const POST = route({ access: 'user', limit: { name: 'checkout', max: 10, windowSeconds: 3600 } }, async ({ request, user, ip }) => {
  const { interval } = await parseBody(request, schema);
  return startCheckout(user, interval, ip);
});
