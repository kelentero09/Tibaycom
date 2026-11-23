import 'server-only';
import { and, eq, sql } from 'drizzle-orm';
import { formatPHP } from '@/lib/money';
import type { BillingInterval } from '@/lib/plans';
import { audit } from './audit';
import { getDb, getEnv, newId, schema } from './db';
import { sendEmail } from './email';
import { getPlanConfig, isSubscriptionActive } from './entitlements';
import { ApiError } from './http';
import { createCheckoutSession, isLiveKey, isMockMode, retrieveCheckoutSession, type PaymongoCheckoutSession, type PaymongoPayment } from './paymongo';

const { payments, subscriptions, user: users } = schema;
type PaymentRow = typeof payments.$inferSelect;

const INTERVAL_LABEL: Record<BillingInterval, string> = { monthly: '1 month', annual: '1 year' };
const SQL_INTERVAL: Record<BillingInterval, string> = { monthly: '+1 month', annual: '+1 year' };
const formatDate = (date: Date) => date.toLocaleDateString('en-PH', { timeZone: 'Asia/Manila', year: 'numeric', month: 'long', day: 'numeric' });

/**
 * Starts a prepaid Premium purchase. The price is read from server-side configuration — the client only
 * chooses the interval. Returns the hosted PayMongo checkout URL.
 */
export async function startCheckout(user: { id: string; email: string; name: string }, interval: BillingInterval, ip: string) {
  const env = getEnv();
  const config = await getPlanConfig();
  const amount = config.pricing[interval];
  const db = getDb();
  const id = newId();
  await db.insert(payments).values({ id, userId: user.id, interval, amount, status: 'pending', livemode: isLiveKey() });

  const returnUrl = `${env.PUBLIC_SITE_URL}/account/subscription?payment=${id}`;
  let checkoutUrl: string;
  let sessionId: string;
  if (isMockMode()) {
    sessionId = `cs_mock_${id}`;
    checkoutUrl = `${env.PUBLIC_SITE_URL}/dev/checkout/${id}`;
  } else {
    try {
      const session = await createCheckoutSession({
        amount,
        name: `Tibay Premium — ${INTERVAL_LABEL[interval]}`,
        description: `Tibay Premium (${INTERVAL_LABEL[interval]}, prepaid, no auto-renewal)`,
        referenceNumber: id,
        successUrl: returnUrl,
        cancelUrl: `${returnUrl}&cancelled=1`,
        email: user.email,
        customerName: user.name,
        metadata: { payment_id: id, user_id: user.id, interval },
      });
      sessionId = session.id;
      checkoutUrl = session.attributes.checkout_url;
    } catch (error) {
      await db.update(payments).set({ status: 'failed', failureReason: 'checkout_create_failed', updatedAt: new Date() }).where(eq(payments.id, id));
      console.error('[billing] could not create checkout session', error);
      throw new ApiError(502, 'We could not start the payment. Please try again in a moment.');
    }
  }
  await db.update(payments).set({ checkoutSessionId: sessionId, updatedAt: new Date() }).where(eq(payments.id, id));
  await audit({ actorId: user.id, actorType: 'user', action: 'payment.checkout_started', targetType: 'payment', targetId: id, metadata: { interval, amount }, ip });
  return { paymentId: id, checkoutUrl };
}

export type ApplyResult = 'applied' | 'already_applied' | 'not_paid' | 'rejected';

/**
 * Applies a paid checkout session exactly once.
 *
 * Both statements run in ONE D1 transaction and are guarded by the payment still being unclaimed:
 * a second delivery (webhook retry, replay, or the browser's return-URL check racing the webhook) is a no-op.
 * The amount and environment are checked against what the server recorded when checkout was created.
 */
export async function applyPaidCheckout(session: PaymongoCheckoutSession, source: 'webhook' | 'return' | 'mock'): Promise<ApplyResult> {
  const db = getDb();
  const row = await db.select().from(payments).where(eq(payments.checkoutSessionId, session.id)).get();
  if (!row) {
    await audit({ actorType: 'system', action: 'payment.unknown_session', targetType: 'checkout_session', targetId: session.id, metadata: { source } });
    return 'rejected';
  }
  if (row.status === 'paid' || row.status === 'refunded') return 'already_applied';
  const userId = row.userId;
  if (!userId) return 'rejected'; // the account was deleted before the payment completed

  const paid = session.attributes.payments?.find((p) => p.attributes.status === 'paid');
  if (!paid) return 'not_paid';

  const mismatch =
    paid.attributes.amount !== row.amount ? 'amount_mismatch' : paid.attributes.currency?.toUpperCase() !== 'PHP' ? 'currency_mismatch' : session.attributes.livemode !== row.livemode ? 'livemode_mismatch' : null;
  if (mismatch) {
    await audit({ actorType: 'system', action: 'payment.rejected', targetType: 'payment', targetId: row.id, metadata: { reason: mismatch, expected: row.amount, received: paid.attributes.amount, source } });
    return 'rejected';
  }

  const now = Date.now();
  const paidAt = paid.attributes.paid_at ? paid.attributes.paid_at * 1000 : now;
  const fee = paid.attributes.fee ?? 0;
  const net = paid.attributes.net_amount ?? row.amount - fee;
  const modifier = SQL_INTERVAL[row.interval];
  const unclaimed = "status IN ('pending', 'failed', 'expired')";
  const d1 = getEnv().DB;

  // Native D1 batch = one implicit transaction: both statements commit or neither does.
  let results;
  try {
    results = await d1.batch([
      // 1) Start or extend the subscription. Renewing early stacks onto the remaining time.
      //    ?1 sub id, ?2 user, ?3 interval, ?4 amount, ?5 now, ?6 date modifier, ?7 payment id
      d1
        .prepare(
          `INSERT INTO subscriptions (id, user_id, interval, status, price_amount, current_period_start, current_period_end, cancel_at_period_end, created_at, updated_at)
           SELECT ?1, ?2, ?3, 'active', ?4, ?5, unixepoch(?5 / 1000, 'unixepoch', ?6) * 1000, 0, ?5, ?5
           WHERE EXISTS (SELECT 1 FROM payments WHERE id = ?7 AND ${unclaimed})
           ON CONFLICT(user_id) DO UPDATE SET
             interval = excluded.interval,
             status = 'active',
             price_amount = excluded.price_amount,
             current_period_start = CASE WHEN subscriptions.status = 'active' AND subscriptions.current_period_end > ?5 THEN subscriptions.current_period_start ELSE ?5 END,
             current_period_end = unixepoch(MAX(?5, CASE WHEN subscriptions.status = 'active' THEN subscriptions.current_period_end ELSE 0 END) / 1000, 'unixepoch', ?6) * 1000,
             cancel_at_period_end = 0,
             reminder_sent_at = NULL,
             updated_at = ?5`,
        )
        .bind(newId(), userId, row.interval, row.amount, now, modifier, row.id),
      // 2) Claim the payment. The UNIQUE provider_payment_id makes a second claim of the same payment impossible.
      //    ?1 provider payment id, ?2 method, ?3 fee, ?4 net, ?5 paid at, ?6 now, ?7 user, ?8 reverse modifier, ?9 payment id
      d1
        .prepare(
          `UPDATE payments SET
             status = 'paid', provider_payment_id = ?1, payment_method = ?2, fee = ?3, net_amount = ?4, paid_at = ?5, failure_reason = NULL, updated_at = ?6,
             period_end = (SELECT current_period_end FROM subscriptions WHERE user_id = ?7),
             period_start = unixepoch((SELECT current_period_end FROM subscriptions WHERE user_id = ?7) / 1000, 'unixepoch', ?8) * 1000
           WHERE id = ?9 AND ${unclaimed}`,
        )
        .bind(paid.id, paid.attributes.source?.type ?? null, fee, net, paidAt, now, userId, modifier.replace('+', '-'), row.id),
    ]);
  } catch (error) {
    // Only a UNIQUE violation means "this provider payment was already used for another checkout".
    // Anything else is unexpected: rethrow so the webhook answers 5xx and PayMongo retries the delivery.
    if (!/UNIQUE constraint failed/i.test(String(error))) throw error;
    await audit({ actorType: 'system', action: 'payment.rejected', targetType: 'payment', targetId: row.id, metadata: { reason: 'duplicate_provider_payment', providerPaymentId: paid.id, source } });
    return 'rejected';
  }
  if (!results[1]?.meta.changes) return 'already_applied';

  await audit({ actorId: userId, actorType: 'system', action: 'payment.paid', targetType: 'payment', targetId: row.id, metadata: { amount: row.amount, fee, net, interval: row.interval, providerPaymentId: paid.id, source } });
  const [account, subscription] = await Promise.all([
    db.select({ email: users.email, name: users.name }).from(users).where(eq(users.id, userId)).get(),
    db.select().from(subscriptions).where(eq(subscriptions.userId, userId)).get(),
  ]);
  if (account && subscription)
    await sendEmail({
      to: account.email,
      subject: 'Your Tibay Premium is active',
      heading: 'Payment received — thank you!',
      paragraphs: [`We received your payment of ${formatPHP(row.amount)} for Tibay Premium (${INTERVAL_LABEL[row.interval]}).`, `Premium is active until ${formatDate(subscription.currentPeriodEnd)}. It will not renew automatically; we will remind you before it ends.`],
      action: { label: 'View subscription', url: `${getEnv().PUBLIC_SITE_URL}/account/subscription` },
    });
  return 'applied';
}

/** Server-side verification used by the return URL: asks PayMongo for the session state — never trusts the browser. */
export async function verifyPayment(userId: string, paymentId: string): Promise<{ status: PaymentRow['status'] }> {
  const db = getDb();
  const row = await db.select().from(payments).where(and(eq(payments.id, paymentId), eq(payments.userId, userId))).get();
  if (!row) throw new ApiError(404, 'Payment not found.');
  if (row.status === 'paid' || row.status === 'refunded') return { status: row.status };
  if (!row.checkoutSessionId || isMockMode()) return { status: row.status };
  try {
    await applyPaidCheckout(await retrieveCheckoutSession(row.checkoutSessionId), 'return');
  } catch (error) {
    console.error('[billing] verification lookup failed', error);
  }
  const fresh = await db.select({ status: payments.status }).from(payments).where(eq(payments.id, paymentId)).get();
  return { status: fresh?.status ?? row.status };
}

/** `payment.failed` — record the attempt; the checkout session stays payable. */
export async function recordFailedPayment(payment: PaymongoPayment) {
  const paymentId = payment.attributes.metadata?.payment_id;
  if (!paymentId) return;
  const reason = payment.attributes.last_payment_error?.message?.slice(0, 200) ?? 'payment_failed';
  const updated = await getDb().update(payments).set({ status: 'failed', failureReason: reason, updatedAt: new Date() }).where(and(eq(payments.id, paymentId), eq(payments.status, 'pending'))).returning({ id: payments.id, userId: payments.userId });
  if (updated[0]) await audit({ actorId: updated[0].userId, actorType: 'system', action: 'payment.failed', targetType: 'payment', targetId: paymentId, metadata: { reason } });
}

/** `payment.refunded` — record the refund; a full refund of the current period removes Premium immediately. */
export async function recordRefund(payment: PaymongoPayment) {
  const db = getDb();
  const row = await db.select().from(payments).where(eq(payments.providerPaymentId, payment.id)).get();
  if (!row) return;
  const refunded = Math.min(row.amount, (payment.attributes.refunds ?? []).reduce((sum, r) => sum + (r.attributes?.amount ?? 0), 0) || row.amount);
  if (refunded <= row.refundedAmount) return; // already recorded
  const full = refunded >= row.amount;
  await db.update(payments).set({ refundedAmount: refunded, status: full ? 'refunded' : row.status, updatedAt: new Date() }).where(eq(payments.id, row.id));
  if (full && row.periodEnd && row.userId) {
    // Only roll back when this payment is what currently grants access.
    await db
      .update(subscriptions)
      .set({ status: 'revoked', currentPeriodEnd: new Date(), updatedAt: new Date() })
      .where(and(eq(subscriptions.userId, row.userId), eq(subscriptions.currentPeriodEnd, row.periodEnd)));
  }
  await audit({ actorId: row.userId, actorType: 'system', action: 'payment.refunded', targetType: 'payment', targetId: row.id, metadata: { refunded, full } });
}

/** "Cancel" for a prepaid plan = stop renewal reminders; access continues until the paid period ends. */
export async function setCancelAtPeriodEnd(userId: string, cancel: boolean, ip: string) {
  const db = getDb();
  const subscription = await db.select().from(subscriptions).where(eq(subscriptions.userId, userId)).get();
  if (!isSubscriptionActive(subscription)) throw new ApiError(409, 'You do not have an active Premium subscription.');
  await db.update(subscriptions).set({ cancelAtPeriodEnd: cancel, updatedAt: new Date() }).where(eq(subscriptions.userId, userId));
  await audit({ actorId: userId, actorType: 'user', action: cancel ? 'subscription.cancelled' : 'subscription.resumed', targetType: 'subscription', targetId: subscription!.id, ip });
}

/** Daily sweep: mark lapsed subscriptions expired (automatic downgrade) and send renewal reminders. */
export async function runSubscriptionMaintenance(now = new Date()) {
  const db = getDb();
  const env = getEnv();
  const config = await getPlanConfig();

  const expired = await db
    .update(subscriptions)
    .set({ status: 'expired', updatedAt: now })
    .where(and(eq(subscriptions.status, 'active'), sql`${subscriptions.currentPeriodEnd} <= ${now.getTime()}`))
    .returning({ userId: subscriptions.userId, id: subscriptions.id });
  for (const sub of expired) {
    await audit({ actorId: sub.userId, actorType: 'system', action: 'subscription.expired', targetType: 'subscription', targetId: sub.id });
    const account = await db.select({ email: users.email }).from(users).where(eq(users.id, sub.userId)).get();
    if (account)
      await sendEmail({
        to: account.email,
        subject: 'Your Tibay Premium has ended',
        heading: 'Your account is now on the Free plan',
        paragraphs: ['Your Premium period has ended. Nothing was deleted — projects and photos above the Free limits are hidden until you renew.'],
        action: { label: 'Renew Premium', url: `${env.PUBLIC_SITE_URL}/account/subscription` },
      });
  }

  const reminderCutoff = now.getTime() + config.renewalReminderDays * 86_400_000;
  const due = await db
    .select({ id: subscriptions.id, userId: subscriptions.userId, end: subscriptions.currentPeriodEnd, email: users.email })
    .from(subscriptions)
    .innerJoin(users, eq(users.id, subscriptions.userId))
    .where(and(eq(subscriptions.status, 'active'), eq(subscriptions.cancelAtPeriodEnd, false), sql`${subscriptions.reminderSentAt} IS NULL`, sql`${subscriptions.currentPeriodEnd} <= ${reminderCutoff}`))
    .limit(200);
  for (const sub of due) {
    await sendEmail({
      to: sub.email,
      subject: 'Your Tibay Premium ends soon',
      heading: `Premium ends on ${formatDate(sub.end)}`,
      paragraphs: ['Renew now to keep all your projects visible and your branding on quotations. Renewing early adds time to your current period — you never lose days.'],
      action: { label: 'Renew Premium', url: `${env.PUBLIC_SITE_URL}/account/subscription` },
    });
    await db.update(subscriptions).set({ reminderSentAt: now }).where(eq(subscriptions.id, sub.id));
  }

  // Abandoned checkouts older than a day are closed out.
  const stale = await db
    .update(payments)
    .set({ status: 'expired', updatedAt: now })
    .where(and(eq(payments.status, 'pending'), sql`${payments.createdAt} < ${now.getTime() - 86_400_000}`))
    .returning({ id: payments.id });

  return { expired: expired.length, reminders: due.length, stalePayments: stale.length };
}
