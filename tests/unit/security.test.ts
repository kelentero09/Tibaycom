import { describe, expect, it } from 'vitest';
import { DEFAULT_PLAN_CONFIG, planConfigSchema } from '@/lib/plans';
import { onboardingSchema, profileUpdateSchema, usernameSchema } from '@/lib/validation';
import { recurringRevenue, rate, parseRange } from '@/server/admin/metrics';
import { toCsv } from '@/server/admin/queries';
import { currentPeriod, isSubscriptionActive } from '@/server/entitlements';
import { signWebhookPayload, verifyWebhookSignature } from '@/server/paymongo';
import { hashPassword, verifyPassword } from '@/server/password';
import { IMAGE_KEY_PATTERN, sniffImage } from '@/server/storage';

describe('webhook signature verification', () => {
  const secret = 'whsk_test_secret';
  const body = JSON.stringify({ data: { id: 'evt_1', attributes: { type: 'checkout_session.payment.paid' } } });
  const now = 1_800_000_000_000;
  const t = now / 1000;

  it('accepts a correctly signed test-mode payload', () => {
    expect(verifyWebhookSignature(body, signWebhookPayload(body, secret, { live: false, timestamp: t }), secret, { live: false, now })).toBe(true);
  });
  it('rejects a tampered body', () => {
    const header = signWebhookPayload(body, secret, { live: false, timestamp: t });
    expect(verifyWebhookSignature(body.replace('evt_1', 'evt_2'), header, secret, { live: false, now })).toBe(false);
  });
  it('rejects the wrong secret', () => {
    expect(verifyWebhookSignature(body, signWebhookPayload(body, 'other', { live: false, timestamp: t }), secret, { live: false, now })).toBe(false);
  });
  it('rejects replayed (stale) and future-dated deliveries', () => {
    const header = signWebhookPayload(body, secret, { live: false, timestamp: t });
    expect(verifyWebhookSignature(body, header, secret, { live: false, now: now + 301_000 })).toBe(false);
    expect(verifyWebhookSignature(body, header, secret, { live: false, now: now - 301_000 })).toBe(false);
  });
  it('does not accept a test signature for a live deployment (and vice versa)', () => {
    expect(verifyWebhookSignature(body, signWebhookPayload(body, secret, { live: false, timestamp: t }), secret, { live: true, now })).toBe(false);
    expect(verifyWebhookSignature(body, signWebhookPayload(body, secret, { live: true, timestamp: t }), secret, { live: false, now })).toBe(false);
  });
  it.each([null, '', 'garbage', 't=abc,te=zz', `t=${t}`, `t=${t},te=,li=`, `te=deadbeef`])('rejects malformed header %j', (header) => {
    expect(verifyWebhookSignature(body, header, secret, { live: false, now })).toBe(false);
  });
  it('rejects everything when no webhook secret is configured', () => {
    expect(verifyWebhookSignature(body, signWebhookPayload(body, '', { live: false, timestamp: t }), '', { live: false, now })).toBe(false);
  });
});

describe('image upload sniffing', () => {
  const bytes = (...values: number[]) => new Uint8Array([...values, ...new Array(16).fill(0)]);
  it('recognises JPEG, PNG and WebP by magic bytes', () => {
    expect(sniffImage(bytes(0xff, 0xd8, 0xff, 0xe0))?.type).toBe('image/jpeg');
    expect(sniffImage(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a))?.type).toBe('image/png');
    expect(sniffImage(new TextEncoder().encode('RIFF\0\0\0\0WEBPVP8 '))?.type).toBe('image/webp');
  });
  it.each([
    ['SVG with script', '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'],
    ['HTML', '<!doctype html><script>alert(1)</script>'],
    ['PHP', '<?php system($_GET["c"]); ?>'],
    ['GIF', 'GIF89a'],
    ['Windows executable', 'MZ\x90\x00'],
    ['PDF', '%PDF-1.7'],
    ['empty', ''],
  ])('rejects %s regardless of the claimed content type', (_label, content) => {
    expect(sniffImage(new TextEncoder().encode(content))).toBeNull();
  });
  it('only serves server-generated keys (no traversal or foreign paths)', () => {
    expect(IMAGE_KEY_PATTERN.test('project/abcDEF123/3f2b8c1e-1a2b-4c3d-9e8f-0123456789ab.webp')).toBe(true);
    for (const bad of ['../secrets.txt', 'project/u/../../x.webp', 'private/u/3f2b8c1e-1a2b-4c3d-9e8f-0123456789ab.webp', 'project/u/x.svg', 'project/u/3f2b8c1e-1a2b-4c3d-9e8f-0123456789ab.webp/extra'])
      expect(IMAGE_KEY_PATTERN.test(bad)).toBe(false);
  });
});

describe('input validation', () => {
  it('normalises and validates usernames', () => {
    expect(usernameSchema.parse('  Juan-Builders  ')).toBe('juan-builders');
    for (const bad of ['ab', 'admin', 'api', '-juan', 'juan-', 'ju--an', 'juan dela cruz', 'juan/../x', '<script>', 'a'.repeat(31)]) expect(usernameSchema.safeParse(bad).success).toBe(false);
  });
  it('accepts listed professions and sensible typed ones, and rejects markup or junk', () => {
    const base = { username: 'juan-builders', intent: 'seeking_clients', businessName: 'Juan Builders', province: 'Cebu', city: 'Argao' };
    const ok = onboardingSchema.safeParse({ ...base, professions: ['mason', 'carpenter', 'Scaffolder', 'Drywall & Ceiling Installer', 'scaffolder'] });
    expect(ok.success && ok.data.professions).toEqual(['mason', 'carpenter', 'scaffolder', 'Drywall & Ceiling Installer']); // case-insensitive de-duplication
    for (const bad of ['<script>alert(1)</script>', 'x', 'a'.repeat(41), '   ', 'Robert"); DROP TABLE user;--', 'line\nbreak'])
      expect(onboardingSchema.safeParse({ ...base, professions: [bad] }).success, bad).toBe(false);
    expect(onboardingSchema.safeParse({ ...base, professions: ['mason', 'carpenter', 'painter', 'welder', 'roofer', 'plumber', 'electrician'] }).success).toBe(false); // more than 6
    expect(onboardingSchema.safeParse({ ...base, professions: [] }).success).toBe(false);
  });

  it('lets homeowners join without a profession, and requires a known intent', () => {
    const base = { username: 'maria-home', businessName: 'Maria Santos', province: 'Cebu', city: 'Argao', professions: [] };
    expect(onboardingSchema.safeParse({ ...base, intent: 'seeking_contractor' }).success).toBe(true);
    expect(onboardingSchema.safeParse({ ...base, intent: 'seeking_work' }).success).toBe(false);
    expect(onboardingSchema.safeParse({ ...base, intent: 'admin', professions: ['mason'] }).success).toBe(false);
    expect(onboardingSchema.safeParse({ ...base, professions: ['mason'] }).success).toBe(false); // intent is required
  });

  it('requires the city to belong to the province', () => {
    const base = { username: 'juan-builders', intent: 'seeking_clients', businessName: 'Juan Builders', professions: ['mason'] };
    expect(onboardingSchema.safeParse({ ...base, province: 'Cebu', city: 'Argao' }).success).toBe(true);
    expect(onboardingSchema.safeParse({ ...base, province: 'Cebu', city: 'Quezon City' }).success).toBe(false);
    expect(onboardingSchema.safeParse({ ...base, province: 'Atlantis', city: 'Argao' }).success).toBe(false);
    expect(onboardingSchema.safeParse({ ...base, province: 'Cebu', city: 'Argao', professions: ['<b>hacker</b>'] }).success).toBe(false);
  });

  const profile = { intent: 'seeking_clients', businessName: 'Juan Builders', bio: '', professions: ['mason'], specializations: ['Plastering', 'Solar PV'], services: [], yearsExperience: 5, province: 'Cebu', city: 'Argao', serviceAreas: [], phone: '', contactEmail: '', facebookUrl: '', messengerUrl: '', isPublished: true };
  it('only allows https links on the expected social domains', () => {
    expect(profileUpdateSchema.safeParse({ ...profile, facebookUrl: 'https://www.facebook.com/juanbuilders', messengerUrl: 'https://m.me/juanbuilders' }).success).toBe(true);
    for (const bad of ['javascript:alert(1)', 'http://facebook.com/x', 'https://facebook.com.evil.example/x', 'https://evil.example/facebook.com', 'data:text/html,<script>'])
      expect(profileUpdateSchema.safeParse({ ...profile, facebookUrl: bad }).success).toBe(false);
  });
  it('drops specializations that do not belong to the chosen professions', () => {
    expect(profileUpdateSchema.parse(profile).specializations).toEqual(['Plastering']);
  });
  it('strips control characters from free text', () => {
    expect(profileUpdateSchema.parse({ ...profile, bio: 'Hello\u0000\u0007 world' }).bio).toBe('Hello world');
  });
  it('validates Philippine phone numbers', () => {
    expect(profileUpdateSchema.safeParse({ ...profile, phone: '0917 123 4567' }).success).toBe(true);
    expect(profileUpdateSchema.safeParse({ ...profile, phone: '+63 917 123 4567' }).success).toBe(true);
    expect(profileUpdateSchema.safeParse({ ...profile, phone: 'call me maybe' }).success).toBe(false);
  });
});

describe('entitlements', () => {
  const now = Date.parse('2026-11-23T00:00:00Z');
  const sub = (status: 'active' | 'expired' | 'revoked', endOffsetDays: number) => ({ status, currentPeriodEnd: new Date(now + endOffsetDays * 86_400_000) });
  it('grants Premium only while a paid period is running', () => {
    expect(isSubscriptionActive(sub('active', 10), now)).toBe(true);
    expect(isSubscriptionActive(sub('active', -1), now)).toBe(false); // lapsed but cron has not run yet
    expect(isSubscriptionActive(sub('active', 0), now)).toBe(false);
    expect(isSubscriptionActive(sub('expired', 10), now)).toBe(false);
    expect(isSubscriptionActive(sub('revoked', 10), now)).toBe(false);
    expect(isSubscriptionActive(null, now)).toBe(false);
    expect(isSubscriptionActive(undefined, now)).toBe(false);
  });
  it('uses Philippine time for the monthly quota period', () => {
    expect(currentPeriod(new Date('2026-11-30T15:59:59Z'))).toBe('2026-11');
    expect(currentPeriod(new Date('2026-11-30T16:00:00Z'))).toBe('2026-12'); // midnight in Manila
  });
  it('ships the published plan table as defaults', () => {
    const { pricing, limits } = DEFAULT_PLAN_CONFIG;
    expect(pricing).toEqual({ monthly: 39_900, annual: 399_000 });
    expect(pricing.monthly * 12 - pricing.annual).toBe(79_800); // "save ₱798" on the annual plan
    expect(limits.free).toMatchObject({ projects: 2, photosPerProject: 2, quotationsPerMonth: 2, customQuotationBranding: false, quotationHistory: false, customCoverPhoto: false, removePlatformBranding: false });
    expect(limits.premium).toMatchObject({ projects: 50, photosPerProject: 10, quotationsPerMonth: null, customQuotationBranding: true, quotationHistory: true, customCoverPhoto: true, removePlatformBranding: true });
    expect(planConfigSchema.safeParse(DEFAULT_PLAN_CONFIG).success).toBe(true);
    expect(planConfigSchema.safeParse({ ...DEFAULT_PLAN_CONFIG, pricing: { monthly: 0, annual: 399_000 } }).success).toBe(false);
  });
});

describe('admin metrics', () => {
  it('normalises annual subscriptions when computing MRR and ARR', () => {
    const { mrr, arr } = recurringRevenue([
      { interval: 'monthly', priceAmount: 14_900 },
      { interval: 'monthly', priceAmount: 14_900 },
      { interval: 'annual', priceAmount: 149_000 },
      { interval: 'monthly', priceAmount: 0 }, // complimentary grant
    ]);
    expect(mrr).toBe(14_900 + 14_900 + 12_417);
    expect(arr).toBe(mrr * 12);
    expect(recurringRevenue([])).toEqual({ mrr: 0, arr: 0 });
  });
  it('computes rates without dividing by zero', () => {
    expect(rate(5, 0)).toBe(0);
    expect(rate(1, 4)).toBe(0.25);
  });
  it('parses date ranges as inclusive Manila days and ignores bad input', () => {
    const range = parseRange('2026-11-01', '2026-11-30');
    expect(range.from.toISOString()).toBe('2026-10-31T16:00:00.000Z');
    expect(range.to.toISOString()).toBe('2026-11-30T16:00:00.000Z');
    const swapped = parseRange('2026-11-30', '2026-11-01');
    expect(swapped.fromInput).toBe('2026-11-01');
    expect(parseRange("'; DROP TABLE user;--", undefined).fromInput).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
  it('escapes CSV and neutralises spreadsheet formulas', () => {
    const csv = toCsv([{ name: 'Juan "JB" Cruz, Jr.', note: '=HYPERLINK("http://evil")', amount: 100, empty: null }]);
    expect(csv).toBe('name,note,amount,empty\r\n"Juan ""JB"" Cruz, Jr.","\'=HYPERLINK(""http://evil"")",100,');
  });
});

describe('password hashing', () => {
  it('hashes with a random salt and verifies in constant time', async () => {
    const first = await hashPassword('correct horse battery');
    const second = await hashPassword('correct horse battery');
    expect(first).not.toBe(second);
    expect(first).not.toContain('correct');
    expect(await verifyPassword({ hash: first, password: 'correct horse battery' })).toBe(true);
    expect(await verifyPassword({ hash: first, password: 'wrong password' })).toBe(false);
    expect(await verifyPassword({ hash: 'malformed', password: 'x' })).toBe(false);
  });
});
