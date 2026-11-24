import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { authMock, call, count, createProfile, createUser, env, installFetchMock, one, outbound, setSubscription, setupTestPlatform, teardownTestPlatform } from './harness';

vi.mock('@/server/auth', () => authMock());

import { POST as adminAction } from '@/app/api/admin/actions/[action]/route';
import { POST as sendReport } from '@/app/api/reports/route';
import { recordRefund } from '@/server/billing';

beforeAll(async () => {
  await setupTestPlatform();
  installFetchMock();
  for (const id of ['vic', 'wes', 'hid', 'payer']) await createUser(id);
  for (const id of ['vic', 'wes', 'hid']) await createProfile(id);
  await createUser('admin', { role: 'admin', twoFactor: true });
});
afterAll(teardownTestPlatform);

describe('unban keeps moderation decisions', () => {
  it('does not reactivate a profile that was suspended before the ban', async () => {
    expect((await call(adminAction, { as: 'admin', body: { profileId: 'profile-vic' }, params: { action: 'profile.suspend' } })).status).toBe(200);
    expect((await call(adminAction, { as: 'admin', body: { userId: 'vic', reason: 'spam' }, params: { action: 'user.ban' } })).status).toBe(200);
    expect((await call(adminAction, { as: 'admin', body: { userId: 'vic' }, params: { action: 'user.unban' } })).status).toBe(200);
    expect(await one('SELECT status FROM profiles WHERE id = ?', 'profile-vic')).toEqual({ status: 'suspended' });
    expect(await one('SELECT banned FROM user WHERE id = ?', 'vic')).toEqual({ banned: 0 });
  });

  it('restores a profile that only the ban suspended', async () => {
    await call(adminAction, { as: 'admin', body: { userId: 'wes', reason: 'spam' }, params: { action: 'user.ban' } });
    expect(await one('SELECT status FROM profiles WHERE id = ?', 'profile-wes')).toEqual({ status: 'suspended' });
    await call(adminAction, { as: 'admin', body: { userId: 'wes' }, params: { action: 'user.unban' } });
    expect(await one('SELECT status FROM profiles WHERE id = ?', 'profile-wes')).toEqual({ status: 'active' });
  });
});

describe('reports', () => {
  it('rejects reports against hidden or suspended profiles', async () => {
    await env.DB.prepare("UPDATE profiles SET is_published = 0 WHERE id = 'profile-hid'").run();
    const body = { username: 'pro-hid', reason: 'spam', details: '', reporterEmail: '', turnstileToken: 'ok' };
    expect((await call(sendReport, { body })).status).toBe(404);
    expect((await call(sendReport, { body: { ...body, username: 'pro-vic' } })).status).toBe(404); // suspended above
    expect((await call(sendReport, { body: { ...body, username: 'pro-wes' } })).status).toBe(200);
    expect(await count('SELECT COUNT(*) AS n FROM reports')).toBe(1);
  });
});

describe('refunds', () => {
  it('never treats a refund event without amounts as a full refund', async () => {
    await setSubscription('payer', { endsInDays: 30 });
    const end = (await one<{ current_period_end: number }>("SELECT current_period_end FROM subscriptions WHERE user_id = 'payer'"))!.current_period_end;
    await env.DB.prepare("INSERT INTO payments (id, user_id, interval, status, amount, provider_payment_id, period_end) VALUES ('pm-1', 'payer', 'monthly', 'paid', 39900, 'pay_empty', ?)").bind(end).run();
    const before = outbound.webhookCalls.length;
    await recordRefund({ id: 'pay_empty', attributes: { amount: 39_900, currency: 'PHP', status: 'refunded', refunds: [] } } as never);
    expect(await one("SELECT status, refunded_amount FROM payments WHERE id = 'pm-1'")).toEqual({ status: 'paid', refunded_amount: 0 });
    expect(await one("SELECT status FROM subscriptions WHERE user_id = 'payer'")).toEqual({ status: 'active' });
    expect(await count("SELECT COUNT(*) AS n FROM alerts WHERE kind = 'payment_refund_unknown'")).toBe(1);
    expect(outbound.webhookCalls.length).toBeGreaterThan(before);
  });
});
