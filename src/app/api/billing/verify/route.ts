import { z } from 'zod';
import { verifyPayment } from '@/server/billing';
import { parseBody, route } from '@/server/http';

const schema = z.object({ paymentId: z.uuid() });

export const POST = route({ access: 'user', limit: { name: 'payment-verify', max: 60, windowSeconds: 3600 } }, async ({ request, user }) => {
  const { paymentId } = await parseBody(request, schema);
  return verifyPayment(user.id, paymentId);
});
