import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { authMock, call, count, createProfile, createUser, env, installFetchMock, one, outbound, PNG, setSubscription, setupTestPlatform, teardownTestPlatform } from './harness';

vi.mock('@/server/auth', () => authMock());

import { POST as adminAction } from '@/app/api/admin/actions/[action]/route';
import { DELETE as deleteInquiry, PATCH as updateInquiry } from '@/app/api/inbox/[id]/route';
import { POST as sendInquiry } from '@/app/api/inquiries/[username]/route';
import { PUT as orderPhotos } from '@/app/api/projects/[id]/photos/order/route';
import { POST as uploadPhoto } from '@/app/api/projects/[id]/photos/route';
import { POST as createProject } from '@/app/api/projects/route';
import { POST as shareQuotation } from '@/app/api/quotations/[id]/share/route';
import { DELETE as deleteQuotation, PATCH as updateQuotation } from '@/app/api/quotations/[id]/route';
import { POST as createQuotation } from '@/app/api/quotations/route';
import { reportProblem } from '@/server/alerts';
import { runDailyMaintenance } from '@/server/maintenance';
import { countNewInquiries, getProjects, listInquiries } from '@/server/profiles';
import { getSharedQuotation } from '@/server/quotations';

const inquiry = { name: 'Ana Reyes', contact: '0917 123 4567', message: 'Kailangan ko po ng quotation para sa bubong.', turnstileToken: 'token' };
const quotation = { clientName: 'Maria Santos', issueDate: '2026-11-01', validUntil: '2026-12-01', items: [{ type: 'labor', description: 'Roofing labor', quantity: 3, unit: 'days', unitPrice: 85_000 }] };
const ip = (n: number) => ({ 'cf-connecting-ip': `198.51.100.${n}` });

beforeAll(async () => {
  await setupTestPlatform();
  installFetchMock();
  for (const id of ['owner', 'rival']) {
    await createUser(id);
    await createProfile(id);
  }
  await createUser('admin', { role: 'admin', twoFactor: true });
  // Reordering needs several photos in one project, which is a Premium allowance.
  await createUser('builder');
  await createProfile('builder');
  await setSubscription('builder', { endsInDays: 30 });
});
afterAll(teardownTestPlatform);
beforeEach(() => {
  outbound.emails.length = 0;
  outbound.resendDown = false;
  outbound.webhookCalls.length = 0;
});

describe('requests inbox', () => {
  it('saves the request and emails the professional', async () => {
    expect((await call(sendInquiry, { body: inquiry, params: { username: 'pro-owner' }, headers: ip(1) })).status).toBe(200);
    const rows = await listInquiries('profile-owner', false);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ name: 'Ana Reyes', contact: '0917 123 4567', status: 'new', emailSent: true });
    expect(outbound.emails).toEqual([{ to: ['owner@tibay.test'], subject: 'New quotation request from Ana Reyes' }]);
    expect(await countNewInquiries('profile-owner')).toBe(1);
  });

  it('keeps the lead even when the email cannot be delivered', async () => {
    outbound.resendDown = true;
    const response = await call(sendInquiry, { body: { ...inquiry, name: 'Ben Cruz' }, params: { username: 'pro-owner' }, headers: ip(2) });
    expect(response.status).toBe(200); // the visitor is not told to try again: the request is safely stored
    const stored = (await listInquiries('profile-owner', false)).find((r) => r.name === 'Ben Cruz');
    expect(stored).toMatchObject({ status: 'new', emailSent: false });
  });

  it('lets only the owning professional read-mark, archive or delete a request', async () => {
    const id = (await listInquiries('profile-owner', false))[0]!.id;
    expect((await call(updateInquiry, { as: 'rival', method: 'PATCH', body: { status: 'read' }, params: { id } })).status).toBe(404);
    expect((await call(deleteInquiry, { as: 'rival', method: 'DELETE', params: { id } })).status).toBe(404);
    expect((await call(updateInquiry, { method: 'PATCH', body: { status: 'read' }, params: { id } })).status).toBe(401);
    expect((await listInquiries('profile-rival', false))).toHaveLength(0);

    expect((await call(updateInquiry, { as: 'owner', method: 'PATCH', body: { status: 'archived' }, params: { id } })).status).toBe(200);
    expect((await listInquiries('profile-owner', true)).map((r) => r.id)).toEqual([id]);
    expect((await call(updateInquiry, { as: 'owner', method: 'PATCH', body: { status: 'spam' }, params: { id } })).status).toBe(422);
    expect((await call(deleteInquiry, { as: 'owner', method: 'DELETE', params: { id } })).status).toBe(200);
    expect(await count('SELECT COUNT(*) AS n FROM inquiries WHERE id = ?', id)).toBe(0);
  });

  it('purges requests older than 180 days', async () => {
    await env.DB.prepare("INSERT INTO inquiries (id, profile_id, name, contact, message, created_at) VALUES ('old', 'profile-owner', 'Old', '0917', 'Old request message', ?)").bind(Date.now() - 181 * 86_400_000).run();
    await runDailyMaintenance();
    expect(await count("SELECT COUNT(*) AS n FROM inquiries WHERE id = 'old'")).toBe(0);
    expect(await count("SELECT COUNT(*) AS n FROM inquiries WHERE profile_id = 'profile-owner'")).toBeGreaterThan(0);
  });
});

describe('photo order and cover', () => {
  let projectId: string;
  let photoIds: string[];

  it('reorders photos; the first one is the cover', async () => {
    projectId = String((await call(createProject, { as: 'builder', body: { title: 'House', description: '', location: '', year: 2026 } })).data.id);
    photoIds = [];
    for (let i = 0; i < 3; i++) photoIds.push(String((await call(uploadPhoto, { as: 'builder', raw: PNG, params: { id: projectId } })).data.id));
    const [a, b, c] = photoIds as [string, string, string];

    expect((await call(orderPhotos, { as: 'builder', method: 'PUT', body: { photoIds: [c, a, b] }, params: { id: projectId } })).status).toBe(200);
    const project = (await getProjects('profile-builder')).find((p) => p.id === projectId)!;
    expect(project.photos.map((p) => p.id)).toEqual([c, a, b]);

    // A photo added afterwards goes to the end, not in front of the chosen cover.
    const added = String((await call(uploadPhoto, { as: 'builder', raw: PNG, params: { id: projectId } })).data.id);
    expect((await getProjects('profile-builder')).find((p) => p.id === projectId)!.photos.map((p) => p.id)).toEqual([c, a, b, added]);
    photoIds.push(added);
  });

  it('rejects incomplete, duplicated or foreign photo lists and other users', async () => {
    const [a, b, c, d] = photoIds as [string, string, string, string];
    const put = (as: string, ids: string[]) => call(orderPhotos, { as, method: 'PUT', body: { photoIds: ids }, params: { id: projectId } });
    expect((await put('builder', [a, b])).status).toBe(409); // missing photos
    expect((await put('builder', [a, a, b, c])).status).toBe(409); // duplicate
    expect((await put('builder', [a, b, c, 'someone-elses-photo'])).status).toBe(409);
    expect((await put('rival', [d, c, b, a])).status).toBe(404); // not their project
    expect((await getProjects('profile-builder')).find((p) => p.id === projectId)!.photos.map((p) => p.id)).toEqual([c, a, b, d]);
  });
});

describe('shareable quotation link', () => {
  let id: string;
  let token: string;

  it('is off by default and creates an unguessable token when enabled', async () => {
    id = String((await call(createQuotation, { as: 'owner', body: quotation })).data.id);
    expect((await one<{ share_token: string | null }>('SELECT share_token FROM quotations WHERE id = ?', id))?.share_token).toBeNull();

    const shared = await call(shareQuotation, { as: 'owner', body: { enabled: true }, params: { id } });
    expect(shared.status).toBe(200);
    token = String(shared.data.shareToken);
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/); // 32 random bytes
  });

  it('shows the client the quotation, with branding decided by the owner’s plan', async () => {
    const view = await getSharedQuotation(token);
    expect(view?.row).toMatchObject({ id, clientName: 'Maria Santos', total: 255_000 });
    expect(view?.entitlements.limits.customQuotationBranding).toBe(false);
    await setSubscription('owner', { endsInDays: 30 });
    expect((await getSharedQuotation(token))?.entitlements.limits.customQuotationBranding).toBe(true);
  });

  it('always reflects the latest saved version', async () => {
    await call(updateQuotation, { as: 'owner', method: 'PATCH', body: { ...quotation, clientName: 'Maria S. Santos' }, params: { id } });
    expect((await getSharedQuotation(token))?.row.clientName).toBe('Maria S. Santos');
  });

  it('returns nothing for wrong, malformed or injected tokens', async () => {
    for (const bad of ['', 'short', `${token}x`, token.slice(0, -1) + (token.endsWith('A') ? 'B' : 'A'), "' OR 1=1 --", '../../etc/passwd', id]) expect(await getSharedQuotation(bad)).toBeNull();
  });

  it('cannot be enabled or disabled by another user', async () => {
    expect((await call(shareQuotation, { as: 'rival', body: { enabled: false }, params: { id } })).status).toBe(404);
    expect((await call(shareQuotation, { body: { enabled: true }, params: { id } })).status).toBe(401);
    expect(await getSharedQuotation(token)).not.toBeNull();
  });

  it('stops working when the owner turns it off, and a new link gets a new token', async () => {
    expect((await call(shareQuotation, { as: 'owner', body: { enabled: false }, params: { id } })).data.shareToken).toBeNull();
    expect(await getSharedQuotation(token)).toBeNull();
    const again = String((await call(shareQuotation, { as: 'owner', body: { enabled: true }, params: { id } })).data.shareToken);
    expect(again).not.toBe(token);
    expect(await getSharedQuotation(token)).toBeNull();
    token = again;
  });

  it('is hidden while the owner’s profile is suspended and gone when the quotation is deleted', async () => {
    await env.DB.prepare("UPDATE profiles SET status = 'suspended' WHERE user_id = 'owner'").run();
    expect(await getSharedQuotation(token)).toBeNull();
    await env.DB.prepare("UPDATE profiles SET status = 'active' WHERE user_id = 'owner'").run();
    expect(await getSharedQuotation(token)).not.toBeNull();
    await call(deleteQuotation, { as: 'owner', method: 'DELETE', params: { id } });
    expect(await getSharedQuotation(token)).toBeNull();
  });
});

describe('error alerting', () => {
  it('notifies the owner by email and chat webhook on the first failure', async () => {
    await reportProblem('payment_checkout', 'PayMongo refused to create a checkout session: 503');
    expect(outbound.emails).toEqual([{ to: ['support@tibay.test'], subject: '[Tibay] Checkout could not be started with PayMongo' }]);
    expect(outbound.webhookCalls).toHaveLength(1);
    expect(outbound.webhookCalls[0]).toContain('PayMongo refused');
  });

  it('throttles repeats to one notification per hour but keeps counting', async () => {
    for (let i = 0; i < 5; i++) await reportProblem('payment_checkout', `failure ${i}`);
    expect(outbound.emails).toHaveLength(0);
    expect(await one("SELECT count, pending_count, last_message FROM alerts WHERE kind = 'payment_checkout'")).toEqual({ count: 6, pending_count: 5, last_message: 'failure 4' });

    vi.useFakeTimers({ now: Date.now() + 61 * 60_000, toFake: ['Date'] });
    await reportProblem('payment_checkout', 'still failing');
    vi.useRealTimers();
    expect(outbound.emails).toHaveLength(1);
    expect(outbound.webhookCalls[0]).toContain('Occurrences since the last alert: 6');
  });

  it('sends one notification when many failures arrive at once', async () => {
    await Promise.all(Array.from({ length: 6 }, (_, i) => reportProblem('webhook_error', `burst ${i}`)));
    expect(outbound.emails.filter((e) => e.subject.includes('Webhook processing errors'))).toHaveLength(1);
  });

  it('raises an alert when an email fails — through the chat webhook, not through email', async () => {
    await env.DB.prepare("DELETE FROM alerts WHERE kind = 'email'").run(); // an earlier test already used this hour's notification
    outbound.resendDown = true;
    await call(sendInquiry, { body: { ...inquiry, name: 'Carla Diaz' }, params: { username: 'pro-owner' }, headers: ip(3) });
    expect(await count("SELECT COUNT(*) AS n FROM alerts WHERE kind = 'email'")).toBe(1);
    expect(outbound.webhookCalls.some((body) => body.includes('Emails are failing to send'))).toBe(true);
    expect(outbound.emails).toHaveLength(0); // no attempt to email about email being down
  });

  it('never lets alerting break the request that reported the problem', async () => {
    const original = env.DB;
    (env as { DB: unknown }).DB = { prepare: () => { throw new Error('database unavailable'); } };
    await expect(reportProblem('api_error', 'boom')).resolves.toBeUndefined();
    (env as { DB: unknown }).DB = original;
  });

  it('lets an admin send a test alert, and only an admin', async () => {
    expect((await call(adminAction, { as: 'owner', body: {}, params: { action: 'alert.test' } })).status).toBe(403);
    expect((await call(adminAction, { as: 'admin', body: {}, params: { action: 'alert.test' } })).status).toBe(200);
    expect(outbound.emails.some((e) => e.subject === '[Tibay] Test alert')).toBe(true);
    // A second test still sends (tests are exempt from the hourly throttle).
    outbound.emails.length = 0;
    await call(adminAction, { as: 'admin', body: {}, params: { action: 'alert.test' } });
    expect(outbound.emails).toHaveLength(1);
  });
});
