import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { applyPaidCheckout, recordFailedPayment } from '@/server/billing';
import { getDb, schema } from '@/server/db';
import { ApiError, parseBody, route } from '@/server/http';
import { isMockMode } from '@/server/paymongo';

const body = z.object({ paymentId: z.uuid(), outcome: z.enum(['paid', 'failed']) });

/**
 * LOCAL SIMULATOR ONLY. Exists so the whole purchase flow can be exercised without PayMongo keys.
 * It returns 404 whenever a PayMongo key is configured or APP_ENV is production.
 */
export const POST = route({ access: 'user' }, async ({ request, user }) => {
  if (!isMockMode()) throw new ApiError(404, 'Not found.');
  const { paymentId, outcome } = await parseBody(request, body);
  const row = await getDb().select().from(schema.payments).where(and(eq(schema.payments.id, paymentId), eq(schema.payments.userId, user.id))).get();
  if (!row?.checkoutSessionId) throw new ApiError(404, 'Payment not found.');

  const fee = Math.round(row.amount * 0.025);
  const payment = {
    id: `pay_mock_${row.id}`,
    attributes: { amount: row.amount, currency: 'PHP', status: outcome, fee, net_amount: row.amount - fee, paid_at: Math.floor(Date.now() / 1000), source: { type: 'gcash' }, metadata: { payment_id: row.id }, last_payment_error: { message: 'Simulated failure' } },
  };
  if (outcome === 'failed') {
    await recordFailedPayment(payment);
    return { result: 'failed' };
  }
  return { result: await applyPaidCheckout({ id: row.checkoutSessionId, attributes: { checkout_url: '', livemode: false, payments: [payment] } }, 'mock') };
});
