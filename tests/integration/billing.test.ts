import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { authMock, call, count, createProfile, createUser, env, installFetchMock, one, outbound, sessionResource, setSubscription, setupTestPlatform, teardownTestPlatform, webhookRequest } from './harness';

vi.mock('@/server/auth', () => authMock());

import { POST as cancelRoute } from '@/app/api/billing/cancel/route';
import { POST as checkoutRoute } from '@/app/api/billing/checkout/route';
import { POST as verifyRoute } from '@/app/api/billing/verify/route';
import { POST as createProject } from '@/app/api/projects/route';
import { POST as webhook } from '@/app/api/webhooks/paymongo/route';
import { runSubscriptionMaintenance } from '@/server/billing';
import { getEntitlements } from '@/server/entitlements';

const DAY = 86_400_000;
const project = { title: 'Project', description: '', location: '', year: null };
let userCounter = 0;

/** Fresh user + pending checkout for each scenario. */
async function startCheckout(interval: 'monthly' | 'annual' = 'monthly', extraBody: Record<string, unknown> = {}) {
  const user = `buyer${++userCounter}`;
  await createUser(user);
  await createProfile(user);
  const response = await call(checkoutRoute, { as: user, body: { interval, ...extraBody } });
  expect(response.status).toBe(200);
  const paymentId = String(response.data.paymentId);
  const row = await one<{ checkout_session_id: string; amount: number }>('SELECT * FROM payments WHERE id = ?', paymentId);
  return { user, paymentId, sessionId: row!.checkout_session_id, amount: row!.amount, checkoutUrl: String(response.data.checkoutUrl) };
}
const pay = (sessionId: string, patch: Partial<{ amount: number; livemode: boolean; paymentId: string }> = {}) => Object.assign(outbound.sessions.get(sessionId)!, { paid: true, ...patch });
const paidEvent = (id: string, sessionId: string) => webhookRequest({ id, type: 'checkout_session.payment.paid', resource: sessionResource(outbound.sessions.get(sessionId)!) });
const subscription = (user: string) => one<{ status: string; interval: string; price_amount: number; current_period_start: number; current_period_end: number; cancel_at_period_end: number }>('SELECT * FROM subscriptions WHERE user_id = ?', user);
const plan = async (user: string) => (await getEntitlements(user)).plan;

beforeAll(async () => {
  await setupTestPlatform();
  installFetchMock();
});
afterAll(teardownTestPlatform);
beforeEach(() => {
  outbound.emails.length = 0;
  outbound.paymongoDown = false;
});

describe('checkout creation', () => {
  it('uses the server-side price and ignores any amount sent by the client', async () => {
    const checkout = await startCheckout('annual', { amount: 100, price: 1, priceAmount: 1 });
    expect(checkout.amount).toBe(149_000);
    const sent = outbound.checkoutRequests.at(-1)!;
    expect((sent.body.data.attributes.line_items as { amount: number }[])[0]!.amount).toBe(149_000);
    expect(sent.idempotencyKey).toBe(checkout.paymentId);
    expect(sent.body.data.attributes.reference_number).toBe(checkout.paymentId);
    expect(checkout.checkoutUrl).toContain('checkout.paymongo.test');
    expect(await plan(checkout.user)).toBe('free');
  });

  it('rejects unknown plans and unauthenticated buyers', async () => {
    await createUser('window-shopper');
    expect((await call(checkoutRoute, { as: 'window-shopper', body: { interval: 'lifetime' } })).status).toBe(422);
    expect((await call(checkoutRoute, { body: { interval: 'monthly' } })).status).toBe(401);
  });

  it('fails cleanly when PayMongo is unavailable', async () => {
    await createUser('unlucky');
    outbound.paymongoDown = true;
    expect((await call(checkoutRoute, { as: 'unlucky', body: { interval: 'monthly' } })).status).toBe(502);
    expect((await one<{ status: string }>("SELECT status FROM payments WHERE user_id = 'unlucky'"))?.status).toBe('failed');
    expect(await plan('unlucky')).toBe('free');
  });
});

describe('frontend success alone never activates Premium', () => {
  it('keeps the user on Free when PayMongo reports the session unpaid', async () => {
    const { user, paymentId } = await startCheckout();
    // The browser lands on the success URL and calls verify — but no payment exists at PayMongo.
    const verify = await call(verifyRoute, { as: user, body: { paymentId } });
    expect(verify.data.status).toBe('pending');
    expect(await plan(user)).toBe('free');
    expect(await subscription(user)).toBeNull();
    expect((await call(createProject, { as: user, body: project })).status).toBe(200);
  });

  it('does not let one user verify or claim another user’s payment', async () => {
    const victim = await startCheckout();
    pay(victim.sessionId);
    await createUser('thief');
    expect((await call(verifyRoute, { as: 'thief', body: { paymentId: victim.paymentId } })).status).toBe(404);
    expect(await plan('thief')).toBe('free');
  });

  it('activates through the return-URL check when the webhook is delayed, after asking PayMongo', async () => {
    const { user, paymentId, sessionId } = await startCheckout();
    pay(sessionId);
    const verify = await call(verifyRoute, { as: user, body: { paymentId } });
    expect(verify.data.status).toBe('paid');
    expect(await plan(user)).toBe('premium');
  });
});

describe('webhook authenticity', () => {
  it('rejects unsigned, wrongly signed, tampered and stale deliveries', async () => {
    const { user, sessionId } = await startCheckout();
    pay(sessionId);
    const resource = sessionResource(outbound.sessions.get(sessionId)!);
    const event = { id: 'evt_forged', type: 'checkout_session.payment.paid', resource };

    const unsigned = new Request('http://localhost:3000/api/webhooks/paymongo', { method: 'POST', body: JSON.stringify({ data: { id: 'evt_forged', attributes: { type: event.type, livemode: false, data: resource } } }) });
    expect((await webhook(unsigned)).status).toBe(401);
    expect((await webhook(webhookRequest(event, { secret: 'whsk_attacker' }))).status).toBe(401);
    expect((await webhook(webhookRequest(event, { tamper: true }))).status).toBe(401);
    expect((await webhook(webhookRequest(event, { timestamp: Math.floor(Date.now() / 1000) - 3600 }))).status).toBe(401);

    expect(await plan(user)).toBe('free');
    expect(await count("SELECT COUNT(*) AS n FROM audit_logs WHERE action = 'webhook.signature_invalid'")).toBe(4);
  });

  it('ignores a validly signed event that claims a payment PayMongo does not confirm', async () => {
    const { user, sessionId } = await startCheckout();
    // Signed with the real secret, but the session is NOT paid according to the API.
    const forged = { ...sessionResource({ ...outbound.sessions.get(sessionId)!, paid: true }) };
    expect((await webhook(webhookRequest({ id: 'evt_lying', type: 'checkout_session.payment.paid', resource: forged }))).status).toBe(200);
    expect(await plan(user)).toBe('free');
  });

  it('ignores live-mode events on a test-mode deployment', async () => {
    const { user, sessionId } = await startCheckout();
    pay(sessionId);
    const response = await webhook(webhookRequest({ id: 'evt_live', type: 'checkout_session.payment.paid', resource: sessionResource(outbound.sessions.get(sessionId)!), livemode: true }));
    expect(response.status).toBe(200);
    expect(await plan(user)).toBe('free');
  });
});

describe('successful payment', () => {
  it('activates Premium, records fee and net, audits and emails the customer', async () => {
    const { user, paymentId, sessionId } = await startCheckout('monthly');
    pay(sessionId);
    const before = Date.now();
    expect((await webhook(paidEvent('evt_ok_1', sessionId))).status).toBe(200);

    const sub = await subscription(user);
    expect(sub).toMatchObject({ status: 'active', interval: 'monthly', price_amount: 14_900 });
    const days = (sub!.current_period_end - before) / DAY;
    expect(days).toBeGreaterThan(27.9);
    expect(days).toBeLessThan(31.1);

    expect(await one('SELECT status, fee, net_amount, provider_payment_id, payment_method FROM payments WHERE id = ?', paymentId)).toEqual({ status: 'paid', fee: 373, net_amount: 14_527, provider_payment_id: `pay_${sessionId}`, payment_method: 'gcash' });
    expect(await count("SELECT COUNT(*) AS n FROM audit_logs WHERE action = 'payment.paid' AND target_id = ?", paymentId)).toBe(1);
    expect(outbound.emails.map((e) => e.subject)).toEqual(['Your Tibay Premium is active']);
    expect(await plan(user)).toBe('premium');
  });

  it('gives an annual plan about a year', async () => {
    const { user, sessionId } = await startCheckout('annual');
    pay(sessionId);
    await webhook(paidEvent('evt_ok_annual', sessionId));
    const sub = await subscription(user);
    const days = (sub!.current_period_end - Date.now()) / DAY;
    expect(days).toBeGreaterThan(364);
    expect(days).toBeLessThan(367);
    expect(sub!.price_amount).toBe(149_000);
  });
});

describe('duplicate and replayed payments', () => {
  it('applies a payment exactly once across webhook retries, replays and the return-URL race', async () => {
    const { user, paymentId, sessionId } = await startCheckout();
    pay(sessionId);

    // Same event delivered three times concurrently, plus the browser verifying at the same moment.
    const results = await Promise.all([webhook(paidEvent('evt_dup', sessionId)), webhook(paidEvent('evt_dup', sessionId)), webhook(paidEvent('evt_dup', sessionId)), call(verifyRoute, { as: user, body: { paymentId } })]);
    expect(results.slice(0, 3).every((r) => (r as Response).status === 200)).toBe(true);
    const first = await subscription(user);

    // A later re-delivery under the same id, and a replay under a NEW event id for the same session.
    await webhook(paidEvent('evt_dup', sessionId));
    await webhook(paidEvent('evt_dup_other_id', sessionId));
    await call(verifyRoute, { as: user, body: { paymentId } });

    const after = await subscription(user);
    expect(after!.current_period_end).toBe(first!.current_period_end); // not extended twice
    expect(await count("SELECT COUNT(*) AS n FROM audit_logs WHERE action = 'payment.paid' AND target_id = ?", paymentId)).toBe(1);
    expect(await count("SELECT COUNT(*) AS n FROM payments WHERE user_id = ? AND status = 'paid'", user)).toBe(1);
    expect(outbound.emails).toHaveLength(1);
  });

  it('cannot reuse one PayMongo payment to pay for a second checkout', async () => {
    const first = await startCheckout();
    pay(first.sessionId, { paymentId: 'pay_shared' });
    await webhook(paidEvent('evt_shared_1', first.sessionId));

    const second = await startCheckout();
    pay(second.sessionId, { paymentId: 'pay_shared' }); // same provider payment id presented again
    await webhook(paidEvent('evt_shared_2', second.sessionId));

    expect(await plan(first.user)).toBe('premium');
    expect(await plan(second.user)).toBe('free');
    expect((await one<{ status: string }>('SELECT status FROM payments WHERE id = ?', second.paymentId))?.status).toBe('pending');
  });
});

describe('payment integrity checks', () => {
  it('rejects a payment whose amount differs from the price the server set', async () => {
    const { user, paymentId, sessionId } = await startCheckout('annual');
    pay(sessionId, { amount: 100 }); // paid ₱1 for an annual plan
    await webhook(paidEvent('evt_underpaid', sessionId));
    expect(await plan(user)).toBe('free');
    expect((await one<{ metadata: string }>("SELECT metadata FROM audit_logs WHERE action = 'payment.rejected' AND target_id = ?", paymentId))?.metadata).toContain('amount_mismatch');
  });

  it('rejects a session from the other PayMongo environment', async () => {
    const { user, sessionId } = await startCheckout();
    pay(sessionId, { livemode: true });
    await call(verifyRoute, { as: user, body: { paymentId: (await one<{ id: string }>('SELECT id FROM payments WHERE checkout_session_id = ?', sessionId))!.id } });
    expect(await plan(user)).toBe('free');
  });

  it('ignores paid events for sessions this application never created', async () => {
    outbound.sessions.set('cs_foreign', { id: 'cs_foreign', amount: 14_900, paid: true });
    expect((await webhook(paidEvent('evt_foreign', 'cs_foreign'))).status).toBe(200);
    expect(await count("SELECT COUNT(*) AS n FROM audit_logs WHERE action = 'payment.unknown_session'")).toBe(1);
  });
});

describe('renewal, expiry and downgrade', () => {
  it('stacks an early renewal onto the remaining time', async () => {
    const first = await startCheckout('monthly');
    pay(first.sessionId);
    await webhook(paidEvent('evt_renew_1', first.sessionId));
    const before = await subscription(first.user);

    const renewal = await call(checkoutRoute, { as: first.user, body: { interval: 'monthly' } });
    const renewalSession = (await one<{ checkout_session_id: string }>('SELECT checkout_session_id FROM payments WHERE id = ?', renewal.data.paymentId))!.checkout_session_id;
    pay(renewalSession);
    await webhook(paidEvent('evt_renew_2', renewalSession));

    const after = await subscription(first.user);
    const added = (after!.current_period_end - before!.current_period_end) / DAY;
    expect(added).toBeGreaterThan(27.9);
    expect(added).toBeLessThan(31.1);
    expect(after!.current_period_start).toBe(before!.current_period_start);
  });

  it('starts a fresh period when renewing after expiry (no back-dated time)', async () => {
    const { user, sessionId } = await startCheckout();
    await setSubscription(user, { status: 'expired', endsInDays: -40 });
    pay(sessionId);
    await webhook(paidEvent('evt_after_expiry', sessionId));
    const sub = await subscription(user);
    expect(sub!.status).toBe('active');
    expect((sub!.current_period_end - Date.now()) / DAY).toBeGreaterThan(27.9);
    expect(sub!.current_period_start).toBeGreaterThan(Date.now() - 60_000);
  });

  it('downgrades automatically at period end, emails the owner and keeps their content', async () => {
    await createUser('lapser');
    await createProfile('lapser');
    await setSubscription('lapser', { endsInDays: 30 });
    for (let i = 0; i < 5; i++) expect((await call(createProject, { as: 'lapser', body: project })).status).toBe(200);

    await setSubscription('lapser', { status: 'active', endsInDays: -1 });
    const result = await runSubscriptionMaintenance();
    expect(result.expired).toBeGreaterThanOrEqual(1);
    expect((await subscription('lapser'))?.status).toBe('expired');
    expect(outbound.emails.some((e) => e.to[0] === 'lapser@tibay.test' && e.subject === 'Your Tibay Premium has ended')).toBe(true);
    expect(await plan('lapser')).toBe('free');
    expect(await count("SELECT COUNT(*) AS n FROM projects WHERE profile_id = 'profile-lapser'")).toBe(5);
    expect((await call(createProject, { as: 'lapser', body: project })).status).toBe(402);
  });

  it('sends one renewal reminder, and none after cancellation', async () => {
    await createUser('soon');
    await createUser('quitter');
    await setSubscription('soon', { endsInDays: 3 });
    await setSubscription('quitter', { endsInDays: 3 });
    expect((await call(cancelRoute, { as: 'quitter', body: { cancel: true } })).status).toBe(200);

    await runSubscriptionMaintenance();
    await runSubscriptionMaintenance();
    const reminders = outbound.emails.filter((e) => e.subject === 'Your Tibay Premium ends soon');
    expect(reminders.filter((e) => e.to[0] === 'soon@tibay.test')).toHaveLength(1);
    expect(reminders.filter((e) => e.to[0] === 'quitter@tibay.test')).toHaveLength(0);
    // Cancelling keeps access until the paid period ends.
    expect(await plan('quitter')).toBe('premium');
    expect((await subscription('quitter'))?.cancel_at_period_end).toBe(1);
  });

  it('refuses to cancel when there is nothing active', async () => {
    await createUser('nobody-sub');
    expect((await call(cancelRoute, { as: 'nobody-sub', body: { cancel: true } })).status).toBe(409);
  });

  it('closes abandoned checkouts but still honours a late payment', async () => {
    const { user, paymentId, sessionId } = await startCheckout();
    await env.DB.prepare('UPDATE payments SET created_at = ? WHERE id = ?').bind(Date.now() - 2 * DAY, paymentId).run();
    await runSubscriptionMaintenance();
    expect((await one<{ status: string }>('SELECT status FROM payments WHERE id = ?', paymentId))?.status).toBe('expired');
    pay(sessionId);
    await webhook(paidEvent('evt_late', sessionId));
    expect(await plan(user)).toBe('premium');
  });
});

describe('failed payments and refunds', () => {
  it('records a failed attempt without granting anything, and still accepts a later success', async () => {
    const { user, paymentId, sessionId } = await startCheckout();
    const failed = { id: 'pay_failed_1', attributes: { amount: 14_900, currency: 'PHP', status: 'failed', metadata: { payment_id: paymentId }, last_payment_error: { message: 'Insufficient funds' } } };
    expect((await webhook(webhookRequest({ id: 'evt_failed', type: 'payment.failed', resource: failed }))).status).toBe(200);
    expect(await one('SELECT status, failure_reason FROM payments WHERE id = ?', paymentId)).toEqual({ status: 'failed', failure_reason: 'Insufficient funds' });
    expect(await plan(user)).toBe('free');

    pay(sessionId);
    await webhook(paidEvent('evt_retry_ok', sessionId));
    expect(await plan(user)).toBe('premium');
  });

  it('revokes Premium on a full refund and records the amount once', async () => {
    const { user, paymentId, sessionId } = await startCheckout();
    pay(sessionId);
    await webhook(paidEvent('evt_to_refund', sessionId));
    expect(await plan(user)).toBe('premium');

    const refunded = { id: `pay_${sessionId}`, attributes: { amount: 14_900, currency: 'PHP', status: 'refunded', refunds: [{ attributes: { amount: 14_900, status: 'succeeded' } }] } };
    await webhook(webhookRequest({ id: 'evt_refund', type: 'payment.refunded', resource: refunded }));
    await webhook(webhookRequest({ id: 'evt_refund_again', type: 'payment.refunded', resource: refunded }));

    expect(await one('SELECT status, refunded_amount FROM payments WHERE id = ?', paymentId)).toEqual({ status: 'refunded', refunded_amount: 14_900 });
    expect((await subscription(user))?.status).toBe('revoked');
    expect(await plan(user)).toBe('free');
    expect(await count("SELECT COUNT(*) AS n FROM audit_logs WHERE action = 'payment.refunded' AND target_id = ?", paymentId)).toBe(1);
  });
});

describe('admin revenue metrics use real records', () => {
  it('separates recurring revenue from cash collected', async () => {
    const { getOverview, parseRange } = await import('@/server/admin/metrics');
    const overview = await getOverview(parseRange());
    const active = await env.DB.prepare("SELECT interval, price_amount FROM subscriptions WHERE status = 'active' AND current_period_end > ?").bind(Date.now()).all<{ interval: string; price_amount: number }>();
    const expectedMrr = active.results.reduce((sum, s) => sum + (s.interval === 'annual' ? Math.round(s.price_amount / 12) : s.price_amount), 0);
    const paid = await one<{ gross: number; fees: number; refunds: number }>("SELECT SUM(amount) AS gross, SUM(fee) AS fees, SUM(refunded_amount) AS refunds FROM payments WHERE status IN ('paid', 'refunded')");

    expect(overview.recurring.mrr).toBe(expectedMrr);
    expect(overview.recurring.arr).toBe(expectedMrr * 12);
    expect(overview.collections.lifetime).toBe(paid!.gross);
    expect(overview.collections.lifetimeNet).toBe(paid!.gross - paid!.fees - paid!.refunds);
    expect(overview.collections.lifetime).not.toBe(overview.recurring.mrr);
    expect(overview.subscriptions.active).toBe(active.results.length);
    expect(overview.users.premium + overview.users.free).toBe(overview.users.total);
    expect(overview.failedPayments).toBeGreaterThanOrEqual(1);
  });
});
