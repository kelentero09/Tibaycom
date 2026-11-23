import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { authMock, call, count, createProfile, createUser, env, installFetchMock, one, outbound, PNG, setSubscription, setupTestPlatform, teardownTestPlatform, WEBP } from './harness';

vi.mock('@/server/auth', () => authMock());

import { POST as adminAction } from '@/app/api/admin/actions/[action]/route';
import { GET as adminExport } from '@/app/api/admin/export/[resource]/route';
import { POST as cronDaily } from '@/app/api/cron/daily/route';
import { POST as mockPay } from '@/app/api/dev/mock-pay/route';
import { GET as serveImage } from '@/app/img/[...key]/route';
import { POST as sendInquiry } from '@/app/api/inquiries/[username]/route';
import { DELETE as deletePhoto } from '@/app/api/photos/[id]/route';
import { PUT as uploadProfileImage } from '@/app/api/profile/image/route';
import { PATCH as updateProfile, POST as createProfileRoute } from '@/app/api/profile/route';
import { DELETE as deleteProject, PATCH as updateProject } from '@/app/api/projects/[id]/route';
import { POST as uploadPhoto } from '@/app/api/projects/[id]/photos/route';
import { POST as createProject } from '@/app/api/projects/route';
import { DELETE as deleteQuotationRoute, PATCH as updateQuotationRoute } from '@/app/api/quotations/[id]/route';
import { POST as duplicateQuotationRoute } from '@/app/api/quotations/[id]/duplicate/route';
import { POST as createQuotationRoute } from '@/app/api/quotations/route';
import { cleanupOrphanedImages } from '@/server/maintenance';

const project = { title: 'Two-storey house', description: 'Design and build', location: 'Cebu', year: 2026 };
const quotation = {
  clientName: 'Maria Santos',
  issueDate: '2026-11-01',
  validUntil: '2026-12-01',
  items: [{ type: 'material', description: 'Cement', quantity: 10, unit: 'bags', unitPrice: 26_000 }],
  // A hostile client may send its own totals; the server must ignore them.
  total: 1,
  subtotal: 1,
};
const profileUpdate = { businessName: 'Renamed', bio: '', professions: ['mason'], specializations: [], services: [], yearsExperience: null, province: 'Cebu', city: 'Argao', serviceAreas: [], phone: '', contactEmail: '', facebookUrl: '', messengerUrl: '', isPublished: true };

beforeAll(async () => {
  await setupTestPlatform();
  installFetchMock();
  for (const id of ['alice', 'bob', 'carol', 'dave', 'erin', 'frank']) await createUser(id);
  for (const id of ['alice', 'bob', 'carol', 'dave', 'erin']) await createProfile(id);
  await createUser('admin', { role: 'admin', twoFactor: true });
  await createUser('admin-no-2fa', { role: 'admin' });
});
afterAll(teardownTestPlatform);

describe('authentication and CSRF', () => {
  it('rejects unauthenticated requests to every protected endpoint', async () => {
    for (const handler of [createProject, createQuotationRoute, updateProfile, uploadProfileImage, adminAction, mockPay]) {
      const response = await call(handler as never, { body: {}, params: { id: 'x', action: 'user.ban' } });
      expect(response.status).toBe(401);
    }
  });

  it('blocks cross-site and origin-less state changes even with a valid session', async () => {
    expect((await call(createProject, { as: 'alice', body: project, origin: 'https://evil.example' })).status).toBe(403);
    expect((await call(createProject, { as: 'alice', body: project, origin: null })).status).toBe(403);
    expect(await count('SELECT COUNT(*) AS n FROM projects')).toBe(0);
  });

  it('does not let a banned user act', async () => {
    await createUser('mallory', { banned: true });
    expect((await call(createProject, { as: 'mallory', body: project })).status).toBe(401);
  });

  it('requires a profile before portfolio and quotation writes', async () => {
    expect((await call(createProject, { as: 'frank', body: project })).status).toBe(409);
    expect((await call(createQuotationRoute, { as: 'frank', body: quotation })).status).toBe(409);
  });
});

describe('onboarding', () => {
  it('creates one profile per user and enforces unique, non-reserved usernames', async () => {
    const input = { username: 'Frank-Builds', businessName: 'Frank Builds', professions: ['mason', 'carpenter'], province: 'Cebu', city: 'Argao' };
    expect((await call(createProfileRoute, { as: 'frank', body: { ...input, username: 'admin' } })).status).toBe(422);
    expect((await call(createProfileRoute, { as: 'frank', body: { ...input, username: 'pro-alice' } })).status).toBe(409);
    const created = await call(createProfileRoute, { as: 'frank', body: input });
    expect(created.status).toBe(200);
    expect(created.data.username).toBe('frank-builds');
    expect(await count("SELECT COUNT(*) AS n FROM profile_professions WHERE profile_id = (SELECT id FROM profiles WHERE user_id = 'frank')")).toBe(2);
    expect((await call(createProfileRoute, { as: 'frank', body: { ...input, username: 'frank-two' } })).status).toBe(409);
  });
});

describe('resource ownership (IDOR)', () => {
  it('prevents editing or deleting another user’s project and photos', async () => {
    const created = await call(createProject, { as: 'alice', body: project });
    const projectId = String(created.data.id);
    const photo = await call(uploadPhoto, { as: 'alice', raw: PNG, params: { id: projectId } });
    expect(photo.status).toBe(200);

    expect((await call(updateProject, { as: 'bob', method: 'PATCH', body: { ...project, title: 'Hacked' }, params: { id: projectId } })).status).toBe(404);
    expect((await call(deleteProject, { as: 'bob', method: 'DELETE', params: { id: projectId } })).status).toBe(404);
    expect((await call(uploadPhoto, { as: 'bob', raw: PNG, params: { id: projectId } })).status).toBe(404);
    expect((await call(deletePhoto, { as: 'bob', method: 'DELETE', params: { id: String(photo.data.id) } })).status).toBe(404);

    expect((await one<{ title: string }>('SELECT title FROM projects WHERE id = ?', projectId))?.title).toBe(project.title);
    expect(await count('SELECT COUNT(*) AS n FROM project_photos WHERE project_id = ?', projectId)).toBe(1);
  });

  it('prevents reading, editing, duplicating or deleting another user’s quotation', async () => {
    const created = await call(createQuotationRoute, { as: 'alice', body: quotation });
    const id = String(created.data.id);
    expect((await call(updateQuotationRoute, { as: 'bob', method: 'PATCH', body: quotation, params: { id } })).status).toBe(404);
    expect((await call(duplicateQuotationRoute, { as: 'bob', params: { id } })).status).toBe(404);
    expect((await call(deleteQuotationRoute, { as: 'bob', method: 'DELETE', params: { id } })).status).toBe(404);
    expect(await count('SELECT COUNT(*) AS n FROM quotations WHERE id = ?', id)).toBe(1);
  });

  it('only ever updates the caller’s own profile', async () => {
    expect((await call(updateProfile, { as: 'bob', method: 'PATCH', body: { ...profileUpdate, userId: 'alice', id: 'profile-alice', status: 'active', username: 'stolen' } })).status).toBe(200);
    expect((await one<{ business_name: string; username: string }>("SELECT business_name, username FROM profiles WHERE user_id = 'alice'"))?.business_name).toBe('Business alice');
    expect((await one<{ business_name: string; username: string }>("SELECT business_name, username FROM profiles WHERE user_id = 'bob'"))).toEqual({ business_name: 'Renamed', username: 'pro-bob' });
  });
});

describe('quotation integrity', () => {
  it('recomputes totals on the server and ignores client-supplied totals', async () => {
    const created = await call(createQuotationRoute, { as: 'bob', body: { ...quotation, discountType: 'percent', discountValue: 1000, taxRateBps: 1200 } });
    expect(created.status).toBe(200);
    const row = await one<{ subtotal: number; discount_amount: number; tax_amount: number; total: number; number: string }>('SELECT * FROM quotations WHERE id = ?', created.data.id);
    expect(row).toMatchObject({ subtotal: 260_000, discount_amount: 26_000, tax_amount: 28_080, total: 262_080 });
    expect(row?.number).toMatch(/^Q-\d{6}-001$/);
  });

  it('rejects malformed quotations', async () => {
    for (const bad of [{ ...quotation, items: [] }, { ...quotation, items: [{ ...quotation.items[0], unitPrice: -5 }] }, { ...quotation, items: [{ ...quotation.items[0], quantity: 'DROP TABLE' }] }, { ...quotation, taxRateBps: 99_999 }])
      expect((await call(createQuotationRoute, { as: 'bob', body: bad })).status).toBe(422);
  });
});

describe('plan limits cannot be bypassed', () => {
  it('caps Free at 2 projects, even under concurrent requests', async () => {
    const results = await Promise.all(Array.from({ length: 8 }, () => call(createProject, { as: 'carol', body: project })));
    expect(results.filter((r) => r.status === 200)).toHaveLength(2);
    expect(results.filter((r) => r.status === 402)).toHaveLength(6);
    expect(await count("SELECT COUNT(*) AS n FROM projects WHERE profile_id = 'profile-carol'")).toBe(2);
  });

  it('caps Free at 2 quotations per month, even under concurrent requests, and deleting does not refund quota', async () => {
    const results = await Promise.all(Array.from({ length: 8 }, () => call(createQuotationRoute, { as: 'carol', body: quotation })));
    const ok = results.filter((r) => r.status === 200);
    expect(ok).toHaveLength(2);
    expect(results.filter((r) => r.status === 402)).toHaveLength(6);
    expect(new Set(ok.map((r) => r.data.number)).size).toBe(2);

    await call(deleteQuotationRoute, { as: 'carol', method: 'DELETE', params: { id: String(ok[0]!.data.id) } });
    expect((await call(createQuotationRoute, { as: 'carol', body: quotation })).status).toBe(402);
    expect((await call(duplicateQuotationRoute, { as: 'carol', params: { id: String(ok[1]!.data.id) } })).status).toBe(402);
  });

  it('caps Free at 2 photos per project, even under concurrent uploads', async () => {
    const projects = await env.DB.prepare("SELECT id FROM projects WHERE profile_id = 'profile-carol'").all<{ id: string }>();
    const [first, second] = projects.results;
    // Six uploads race into the first project: exactly two may land.
    const burst = await Promise.all(Array.from({ length: 6 }, (_, i) => call(uploadPhoto, { as: 'carol', raw: i % 2 ? PNG : WEBP, params: { id: first!.id } })));
    expect(burst.filter((r) => r.status === 200)).toHaveLength(2);
    expect(burst.filter((r) => r.status === 402)).toHaveLength(4);
    expect(await count('SELECT COUNT(*) AS n FROM project_photos WHERE project_id = ?', first!.id)).toBe(2);
    // The limit is per project: the second project still has its own two slots.
    const second1 = await call(uploadPhoto, { as: 'carol', raw: PNG, params: { id: second!.id } });
    const second2 = await call(uploadPhoto, { as: 'carol', raw: WEBP, params: { id: second!.id } });
    const second3 = await call(uploadPhoto, { as: 'carol', raw: PNG, params: { id: second!.id } });
    expect([second1.status, second2.status, second3.status]).toEqual([200, 200, 402]);
    // Rejected uploads leave nothing behind in storage.
    expect((await env.BUCKET.list({ prefix: 'project/carol/' })).objects).toHaveLength(4);
  });

  it('gives Premium 50 projects, 10 photos per project and unlimited quotations', async () => {
    await createUser('prem');
    await createProfile('prem');
    await setSubscription('prem', { endsInDays: 30 });
    const created = await call(createProject, { as: 'prem', body: project });
    const uploads = [];
    for (let i = 0; i < 11; i++) uploads.push((await call(uploadPhoto, { as: 'prem', raw: PNG, params: { id: String(created.data.id) } })).status);
    expect(uploads.filter((s) => s === 200)).toHaveLength(10);
    expect(uploads[10]).toBe(402);

    const quotes = await Promise.all(Array.from({ length: 12 }, () => call(createQuotationRoute, { as: 'prem', body: quotation })));
    expect(quotes.every((r) => r.status === 200)).toBe(true);
    expect(new Set(quotes.map((r) => r.data.number)).size).toBe(12); // still numbered uniquely under concurrency

    // 50 projects: fill to the limit directly, then the API must refuse the 51st.
    const now = Date.now();
    for (let i = 0; i < 49; i++) await env.DB.prepare("INSERT INTO projects (id, profile_id, title, created_at, updated_at) VALUES (?, 'profile-prem', 'Bulk', ?, ?)").bind(`bulk-${i}`, now, now).run();
    expect((await call(createProject, { as: 'prem', body: project })).status).toBe(402);
    expect(await count("SELECT COUNT(*) AS n FROM projects WHERE profile_id = 'profile-prem'")).toBe(50);
  });

  it('refuses the Premium-only cover photo on Free but allows avatar and logo', async () => {
    expect((await call(uploadProfileImage, { as: 'carol', method: 'PUT', raw: PNG, url: 'http://localhost:3000/api/profile/image?kind=cover' })).status).toBe(402);
    expect((await call(uploadProfileImage, { as: 'carol', method: 'PUT', raw: PNG, url: 'http://localhost:3000/api/profile/image?kind=avatar' })).status).toBe(200);
    expect((await call(uploadProfileImage, { as: 'carol', method: 'PUT', raw: PNG, url: 'http://localhost:3000/api/profile/image?kind=banner' })).status).toBe(400);
  });

  it('unlocks Premium limits only while a paid period is active', async () => {
    await setSubscription('dave', { endsInDays: 30 });
    const results = [];
    for (let i = 0; i < 5; i++) results.push(await call(createProject, { as: 'dave', body: project }));
    expect(results.every((r) => r.status === 200)).toBe(true);
    expect((await call(uploadProfileImage, { as: 'dave', method: 'PUT', raw: PNG, url: 'http://localhost:3000/api/profile/image?kind=cover' })).status).toBe(200);
  });

  it('treats a lapsed subscription as Free immediately — before any cron job runs', async () => {
    await setSubscription('dave', { status: 'active', endsInDays: -1 }); // status still says "active", period is over
    expect((await call(createProject, { as: 'dave', body: project })).status).toBe(402);
    expect((await call(uploadProfileImage, { as: 'dave', method: 'PUT', raw: PNG, url: 'http://localhost:3000/api/profile/image?kind=cover' })).status).toBe(402);
    // Nothing was deleted by the downgrade.
    expect(await count("SELECT COUNT(*) AS n FROM projects WHERE profile_id = 'profile-dave'")).toBe(5);
  });

  it('locks quotation history on Free and restores it on Premium', async () => {
    const created = await call(createQuotationRoute, { as: 'erin', body: quotation });
    const id = String(created.data.id);
    await env.DB.prepare('UPDATE quotations SET created_at = ? WHERE id = ?').bind(Date.now() - 62 * 86_400_000, id).run(); // two months old
    expect((await call(updateQuotationRoute, { as: 'erin', method: 'PATCH', body: quotation, params: { id } })).status).toBe(402);
    expect((await call(duplicateQuotationRoute, { as: 'erin', params: { id } })).status).toBe(402);
    await setSubscription('erin', { endsInDays: 30 });
    expect((await call(updateQuotationRoute, { as: 'erin', method: 'PATCH', body: quotation, params: { id } })).status).toBe(200);
  });

  it('applies admin-configured limits immediately', async () => {
    const config = { pricing: { monthly: 19_900, annual: 199_000 }, renewalReminderDays: 5, limits: { free: { projects: 1, photosPerProject: 1, quotationsPerMonth: 1, customQuotationBranding: false, quotationHistory: false, customCoverPhoto: false, removePlatformBranding: false }, premium: { projects: 50, photosPerProject: 10, quotationsPerMonth: null, customQuotationBranding: true, quotationHistory: true, customCoverPhoto: true, removePlatformBranding: true } } };
    expect((await call(adminAction, { as: 'admin', body: config, params: { action: 'settings.plans' } })).status).toBe(200);
    await createUser('gina');
    await createProfile('gina');
    const only = await call(createProject, { as: 'gina', body: project });
    expect(only.status).toBe(200);
    expect((await call(createProject, { as: 'gina', body: project })).status).toBe(402);
    expect((await call(uploadPhoto, { as: 'gina', raw: PNG, params: { id: String(only.data.id) } })).status).toBe(200);
    expect((await call(uploadPhoto, { as: 'gina', raw: PNG, params: { id: String(only.data.id) } })).status).toBe(402);
    expect((await call(createQuotationRoute, { as: 'gina', body: quotation })).status).toBe(200);
    expect((await call(createQuotationRoute, { as: 'gina', body: quotation })).status).toBe(402);
    // The old settings shape (before per-project photo limits) is rejected rather than half-applied.
    expect((await call(adminAction, { as: 'admin', body: { ...config, limits: { ...config.limits, free: { ...config.limits.free, photosPerProject: undefined, photos: 10 } } }, params: { action: 'settings.plans' } })).status).toBe(422);
    await env.DB.prepare("DELETE FROM settings WHERE key = 'plans'").run();
  });
});

describe('malicious uploads', () => {
  const upload = (bytes: Uint8Array, headers?: Record<string, string>) => call(uploadProfileImage, { as: 'bob', method: 'PUT', raw: bytes, headers, url: 'http://localhost:3000/api/profile/image?kind=avatar' });
  const text = (value: string) => new TextEncoder().encode(value);

  it.each([
    ['SVG with script', text('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>')],
    ['HTML disguised as image', text('<!doctype html><script>fetch("/api/profile")</script>')],
    ['PHP web shell', text('<?php system($_GET["c"]); ?>')],
    ['executable', new Uint8Array([0x4d, 0x5a, 0x90, 0x00, 1, 2, 3, 4, 5, 6, 7, 8])],
    ['GIF', text('GIF89a........')],
  ])('rejects %s even when it claims to be image/png', async (_label, bytes) => {
    expect((await upload(bytes, { 'x-claimed-type': 'image/png' })).status).toBe(415);
  });

  it('rejects empty and oversized files', async () => {
    expect((await upload(new Uint8Array())).status).toBe(400);
    const big = new Uint8Array(1_500_001);
    big.set(PNG);
    expect((await upload(big)).status).toBe(413);
  });

  it('stores valid images under a server-generated key and serves them safely', async () => {
    const response = await upload(PNG);
    expect(response.status).toBe(200);
    const url = String(response.data.url);
    expect(url).toMatch(/^\/img\/avatar\/bob\/[0-9a-f-]{36}\.png$/);

    const served = await serveImage(new Request(`http://localhost:3000${url}`), { params: Promise.resolve({ key: url.replace('/img/', '').split('/') }) });
    expect(served.status).toBe(200);
    expect(served.headers.get('content-type')).toBe('image/png');
    expect(served.headers.get('x-content-type-options')).toBe('nosniff');
    expect(served.headers.get('cache-control')).toContain('immutable');
    await served.arrayBuffer();

    for (const key of [['..', 'secret'], ['avatar', 'bob', '..', '..', 'x.png'], ['private', 'bob', '00000000-0000-0000-0000-000000000000.png']])
      expect((await serveImage(new Request('http://localhost:3000/img/x'), { params: Promise.resolve({ key }) })).status).toBe(404);
  });

  it('replaces the previous image instead of leaking storage', async () => {
    const before = (await one<{ avatar_key: string }>("SELECT avatar_key FROM profiles WHERE user_id = 'bob'"))!.avatar_key;
    await upload(WEBP);
    expect(await env.BUCKET.head(before)).toBeNull();
  });

  it('removes orphaned objects but keeps referenced and recent ones', async () => {
    await env.BUCKET.put('project/ghost/11111111-1111-4111-8111-111111111111.webp', WEBP);
    const fresh = await cleanupOrphanedImages();
    expect(fresh.deleted).toBe(0); // inside the 24-hour grace period
    vi.useFakeTimers({ now: Date.now() + 2 * 86_400_000, toFake: ['Date'] });
    const later = await cleanupOrphanedImages();
    vi.useRealTimers();
    expect(later.deleted).toBe(1);
    const avatar = (await one<{ avatar_key: string }>("SELECT avatar_key FROM profiles WHERE user_id = 'bob'"))!.avatar_key;
    expect(await env.BUCKET.head(avatar)).not.toBeNull();
    expect(await count("SELECT COUNT(*) AS n FROM project_photos WHERE profile_id = 'profile-carol'")).toBe(4);
  });
});

describe('public forms', () => {
  const inquiry = { name: 'Client Name', contact: '0917 000 0000', message: 'I need a quotation for a small house.', turnstileToken: 'token' };

  it('delivers a quotation request to the professional by email', async () => {
    outbound.emails.length = 0;
    const response = await call(sendInquiry, { body: inquiry, params: { username: 'pro-alice' } });
    expect(response.status).toBe(200);
    expect(outbound.emails).toEqual([{ to: ['alice@tibay.test'], subject: 'New quotation request from Client Name' }]);
  });

  it('requires a passing Turnstile check', async () => {
    outbound.turnstileOk = false;
    expect((await call(sendInquiry, { body: inquiry, params: { username: 'pro-alice' }, headers: { 'cf-connecting-ip': '203.0.113.20' } })).status).toBe(400);
    outbound.turnstileOk = true;
    expect((await call(sendInquiry, { body: { ...inquiry, turnstileToken: undefined }, params: { username: 'pro-alice' }, headers: { 'cf-connecting-ip': '203.0.113.21' } })).status).toBe(422);
  });

  it('rate limits repeated requests from one address', async () => {
    const statuses = [];
    for (let i = 0; i < 7; i++) statuses.push((await call(sendInquiry, { body: inquiry, params: { username: 'pro-alice' }, headers: { 'cf-connecting-ip': '198.51.100.7' } })).status);
    expect(statuses.slice(0, 5)).toEqual([200, 200, 200, 200, 200]);
    expect(statuses.slice(5)).toEqual([429, 429]);
  });

  it('does not reveal suspended or unknown profiles', async () => {
    await env.DB.prepare("UPDATE profiles SET status = 'suspended' WHERE user_id = 'erin'").run();
    expect((await call(sendInquiry, { body: inquiry, params: { username: 'pro-erin' }, headers: { 'cf-connecting-ip': '203.0.113.30' } })).status).toBe(404);
    expect((await call(sendInquiry, { body: inquiry, params: { username: 'nobody' }, headers: { 'cf-connecting-ip': '203.0.113.31' } })).status).toBe(404);
  });
});

describe('admin area', () => {
  it('requires the admin role AND two-factor authentication', async () => {
    const body = { userId: 'bob', reason: 'test' };
    expect((await call(adminAction, { as: 'alice', body, params: { action: 'user.ban' } })).status).toBe(403);
    expect((await call(adminAction, { as: 'admin-no-2fa', body, params: { action: 'user.ban' } })).status).toBe(403);
    expect((await call(adminExport, { as: 'alice', method: 'GET', params: { resource: 'users' } })).status).toBe(403);
    expect((await call(adminExport, { as: 'admin-no-2fa', method: 'GET', params: { resource: 'users' } })).status).toBe(403);
    expect((await one<{ banned: number }>("SELECT banned FROM user WHERE id = 'bob'"))?.banned).toBe(0);
  });

  it('bans a user: sessions revoked, profile suspended, action audited', async () => {
    await env.DB.prepare("INSERT INTO session (id, expires_at, token, user_id, created_at, updated_at) VALUES ('s1', ?, 'tok', 'bob', ?, ?)").bind(Date.now() + 1e9, Date.now(), Date.now()).run();
    const response = await call(adminAction, { as: 'admin', body: { userId: 'bob', reason: 'Fake portfolio' }, params: { action: 'user.ban' } });
    expect(response.status).toBe(200);
    expect(await count("SELECT COUNT(*) AS n FROM session WHERE user_id = 'bob'")).toBe(0);
    expect((await one<{ status: string }>("SELECT status FROM profiles WHERE user_id = 'bob'"))?.status).toBe('suspended');
    expect(await one("SELECT actor_id, target_id FROM audit_logs WHERE action = 'admin.user.ban'")).toEqual({ actor_id: 'admin', target_id: 'bob' });
    expect((await call(createProject, { as: 'bob', body: project })).status).toBe(401);
  });

  it('protects admins from being banned and rejects unknown actions or bad input', async () => {
    expect((await call(adminAction, { as: 'admin', body: { userId: 'admin' }, params: { action: 'user.ban' } })).status).toBe(400);
    expect((await call(adminAction, { as: 'admin', body: { userId: 'admin-no-2fa' }, params: { action: 'user.ban' } })).status).toBe(400);
    expect((await call(adminAction, { as: 'admin', body: {}, params: { action: 'user.promote' } })).status).toBe(404);
    expect((await call(adminAction, { as: 'admin', body: { userId: 'alice', days: 100_000 }, params: { action: 'subscription.grant' } })).status).toBe(422);
  });

  it('grants complimentary Premium without inflating recurring revenue', async () => {
    expect((await call(adminAction, { as: 'admin', body: { userId: 'alice', days: 30 }, params: { action: 'subscription.grant' } })).status).toBe(200);
    const sub = await one<{ status: string; price_amount: number; current_period_end: number }>("SELECT * FROM subscriptions WHERE user_id = 'alice'");
    expect(sub?.status).toBe('active');
    expect(sub?.price_amount).toBe(0);
    expect(sub!.current_period_end).toBeGreaterThan(Date.now() + 29 * 86_400_000);
  });

  it('exports CSV for admins and records the export', async () => {
    const response = await call(adminExport, { as: 'admin', method: 'GET', params: { resource: 'users' }, url: 'http://localhost:3000/api/admin/export/users' });
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/csv');
    expect(String(response.data.text)).toContain('alice@tibay.test');
    expect(await count("SELECT COUNT(*) AS n FROM audit_logs WHERE action = 'admin.export'")).toBe(1);
    expect((await call(adminExport, { as: 'admin', method: 'GET', params: { resource: 'secrets' } })).status).toBe(404);
  });
});

describe('internal endpoints', () => {
  it('hides the cron endpoint without the shared secret', async () => {
    const request = (auth?: string) => cronDaily(new Request('http://localhost:3000/api/cron/daily', { method: 'POST', headers: auth ? { authorization: auth } : {} }));
    expect((await request()).status).toBe(404);
    expect((await request('Bearer wrong')).status).toBe(404);
    expect((await request('Bearer cron_integration_secret')).status).toBe(200);
  });

  it('disables the payment simulator whenever a PayMongo key is configured', async () => {
    expect((await call(mockPay, { as: 'alice', body: { paymentId: '3f2b8c1e-1a2b-4c3d-9e8f-0123456789ab', outcome: 'paid' } })).status).toBe(404);
  });
});
