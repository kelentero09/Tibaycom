import { eq } from 'drizzle-orm';
import { reportProblem } from '@/server/alerts';
import { audit } from '@/server/audit';
import { applyPaidCheckout, recordFailedPayment, recordRefund } from '@/server/billing';
import { getDb, getEnv, schema } from '@/server/db';
import { isLiveKey, retrieveCheckoutSession, verifyWebhookSignature, type PaymongoEvent, type PaymongoPayment } from '@/server/paymongo';

const ok = (body: Record<string, unknown> = {}) => Response.json({ received: true, ...body });

/**
 * PayMongo webhook. Security model:
 *  1. HMAC signature + timestamp tolerance (authenticity, replay window)
 *  2. processed-event table (replay / duplicate delivery)
 *  3. the checkout session is re-fetched from PayMongo's API — the webhook body is only a notification
 *  4. `applyPaidCheckout` is itself idempotent and validates amount + environment
 * No session cookie and no Origin check apply here; the signature is the authentication.
 */
export async function POST(request: Request) {
  const env = getEnv();
  const rawBody = await request.text();
  if (rawBody.length > 500_000) return new Response('Payload too large', { status: 413 });

  const live = isLiveKey();
  if (!verifyWebhookSignature(rawBody, request.headers.get('paymongo-signature'), env.PAYMONGO_WEBHOOK_SECRET, { live })) {
    await audit({ actorType: 'system', action: 'webhook.signature_invalid', ip: request.headers.get('cf-connecting-ip') ?? undefined });
    await reportProblem('webhook_signature', 'A PayMongo webhook arrived with an invalid signature. If this follows a real payment, the webhook secret or signature format is wrong and payments will not sync.');
    return new Response('Invalid signature', { status: 401 });
  }

  let event: PaymongoEvent;
  try {
    event = (JSON.parse(rawBody) as { data: PaymongoEvent }).data;
    if (!event?.id || !event.attributes?.type) throw new Error('malformed');
  } catch {
    return new Response('Malformed payload', { status: 400 });
  }
  // A test-mode event must never touch a live deployment (and vice versa).
  if (event.attributes.livemode !== live) return ok({ ignored: 'livemode_mismatch' });

  const db = getDb();
  const seen = await db.select({ id: schema.webhookEvents.id }).from(schema.webhookEvents).where(eq(schema.webhookEvents.id, event.id)).get();
  if (seen) return ok({ duplicate: true });

  try {
    const resource = event.attributes.data;
    switch (event.attributes.type) {
      case 'checkout_session.payment.paid':
        await applyPaidCheckout(await retrieveCheckoutSession(resource.id), 'webhook');
        break;
      case 'payment.failed':
        await recordFailedPayment(resource as unknown as PaymongoPayment);
        break;
      case 'payment.refunded':
        await recordRefund(resource as unknown as PaymongoPayment);
        break;
      default:
        break; // Unhandled event types are acknowledged so PayMongo does not retry them.
    }
  } catch (error) {
    // Do NOT record the event: a non-2xx response makes PayMongo retry, and processing is idempotent.
    await reportProblem('webhook_error', `Processing ${event.attributes.type} (${event.id}) failed: ${String(error).slice(0, 300)}`);
    return new Response('Processing failed', { status: 500 });
  }

  await db.insert(schema.webhookEvents).values({ id: event.id, type: event.attributes.type }).onConflictDoNothing();
  return ok();
}
