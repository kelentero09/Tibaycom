import { readdirSync, readFileSync } from 'node:fs';
import { vi } from 'vitest';
import { getPlatformProxy, type PlatformProxy } from 'wrangler';
import { signWebhookPayload } from '@/server/paymongo';
import { setTestEnv } from '../stubs/cloudflare-context';

export const SITE = 'http://localhost:3000';
export const WEBHOOK_SECRET = 'whsk_integration_secret';
export const CRON_SECRET = 'cron_integration_secret';

let platform: PlatformProxy<CloudflareEnv> | undefined;
export let env: CloudflareEnv;

/** Starts real (in-memory) D1 and R2 through Miniflare, applies every migration and installs the env for server modules. */
export async function setupTestPlatform(overrides: Partial<CloudflareEnv> = {}) {
  platform = await getPlatformProxy<CloudflareEnv>({ configPath: 'wrangler.jsonc', persist: false });
  env = {
    ...platform.env,
    APP_ENV: 'test',
    PUBLIC_SITE_URL: SITE,
    SUPPORT_EMAIL: 'support@tibay.test',
    EMAIL_FROM: 'Tibay <no-reply@tibay.test>',
    BETTER_AUTH_SECRET: 'integration-secret-integration-secret',
    TURNSTILE_SECRET_KEY: 'turnstile-secret',
    RESEND_API_KEY: 're_test',
    PAYMONGO_SECRET_KEY: 'sk_test_integration',
    PAYMONGO_WEBHOOK_SECRET: WEBHOOK_SECRET,
    CRON_SECRET,
    ...overrides,
  };
  setTestEnv(env);
  for (const file of readdirSync('migrations').filter((f) => f.endsWith('.sql')).sort()) {
    for (const statement of readFileSync(`migrations/${file}`, 'utf8').split('--> statement-breakpoint')) {
      if (statement.trim()) await env.DB.prepare(statement).run();
    }
  }
  return env;
}

export async function teardownTestPlatform() {
  await platform?.dispose();
}

/* ------------------------------------------------------------------ */
/* Outbound HTTP (PayMongo, Turnstile, Resend) is always faked         */
/* ------------------------------------------------------------------ */

export type FakeSession = { id: string; amount: number; paid: boolean; livemode?: boolean; fee?: number; paymentId?: string; metadata?: Record<string, string> };
export const outbound = {
  emails: [] as { to: string[]; subject: string }[],
  checkoutRequests: [] as { body: { data: { attributes: Record<string, unknown> } }; idempotencyKey: string | null }[],
  sessions: new Map<string, FakeSession>(),
  turnstileOk: true,
  paymongoDown: false,
};

export function sessionResource(session: FakeSession) {
  return {
    id: session.id,
    type: 'checkout_session',
    attributes: {
      checkout_url: `https://checkout.paymongo.test/${session.id}`,
      livemode: session.livemode ?? false,
      metadata: session.metadata ?? null,
      payments: session.paid
        ? [{ id: session.paymentId ?? `pay_${session.id}`, attributes: { amount: session.amount, currency: 'PHP', status: 'paid', fee: session.fee ?? 373, net_amount: session.amount - (session.fee ?? 373), paid_at: Math.floor(Date.now() / 1000), source: { type: 'gcash' } } }]
        : [],
    },
  };
}

export function installFetchMock() {
  let counter = 0;
  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });
    if (url.startsWith('https://challenges.cloudflare.com/turnstile')) return json({ success: outbound.turnstileOk });
    if (url.startsWith('https://api.resend.com/emails')) {
      const body = JSON.parse(String(init?.body)) as { to: string[]; subject: string };
      outbound.emails.push({ to: body.to, subject: body.subject });
      return json({ id: 'email_1' });
    }
    if (url === 'https://api.paymongo.com/v1/checkout_sessions' && init?.method === 'POST') {
      if (outbound.paymongoDown) return json({ errors: [{ detail: 'Service unavailable' }] }, 503);
      const body = JSON.parse(String(init.body)) as { data: { attributes: { line_items: { amount: number }[]; metadata: Record<string, string> } } };
      outbound.checkoutRequests.push({ body, idempotencyKey: new Headers(init.headers).get('idempotency-key') });
      const session: FakeSession = { id: `cs_test_${++counter}`, amount: body.data.attributes.line_items[0]!.amount, paid: false, metadata: body.data.attributes.metadata };
      outbound.sessions.set(session.id, session);
      return json({ data: sessionResource(session) });
    }
    const match = url.match(/^https:\/\/api\.paymongo\.com\/v1\/checkout_sessions\/([^/]+)$/);
    if (match) {
      const session = outbound.sessions.get(decodeURIComponent(match[1]!));
      return session ? json({ data: sessionResource(session) }) : json({ errors: [{ detail: 'not found' }] }, 404);
    }
    throw new Error(`Unexpected outbound request in test: ${url}`);
  });
}

/* ------------------------------------------------------------------ */
/* Fixtures                                                            */
/* ------------------------------------------------------------------ */

type UserOptions = { role?: 'user' | 'admin'; twoFactor?: boolean; banned?: boolean };
export async function createUser(id: string, options: UserOptions = {}) {
  const now = Date.now();
  await env.DB.prepare('INSERT INTO user (id, name, email, email_verified, role, banned, two_factor_enabled, created_at, updated_at) VALUES (?, ?, ?, 1, ?, ?, ?, ?, ?)')
    .bind(id, `User ${id}`, `${id}@tibay.test`, options.role ?? 'user', options.banned ? 1 : 0, options.twoFactor ? 1 : 0, now, now)
    .run();
  return id;
}

export async function createProfile(userId: string, username = `pro-${userId}`) {
  const id = `profile-${userId}`;
  const now = Date.now();
  await env.DB.prepare("INSERT INTO profiles (id, user_id, username, business_name, province, city, created_at, updated_at) VALUES (?, ?, ?, ?, 'Cebu', 'Argao', ?, ?)")
    .bind(id, userId, username, `Business ${userId}`, now, now)
    .run();
  return id;
}

export async function setSubscription(userId: string, options: { status?: 'active' | 'expired' | 'revoked'; endsInDays: number; interval?: 'monthly' | 'annual'; price?: number }) {
  const now = Date.now();
  await env.DB.prepare(
    'INSERT INTO subscriptions (id, user_id, interval, status, price_amount, current_period_start, current_period_end, cancel_at_period_end, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?) ON CONFLICT(user_id) DO UPDATE SET status = excluded.status, current_period_end = excluded.current_period_end',
  )
    .bind(`sub-${userId}`, userId, options.interval ?? 'monthly', options.status ?? 'active', options.price ?? 14_900, now - 86_400_000, now + options.endsInDays * 86_400_000, now, now)
    .run();
}

export const one = <T = Record<string, unknown>>(query: string, ...params: unknown[]) => env.DB.prepare(query).bind(...params).first<T>();
export const count = async (query: string, ...params: unknown[]) => Number((await one<{ n: number }>(query, ...params))?.n ?? 0);

/* ------------------------------------------------------------------ */
/* Calling route handlers                                              */
/* ------------------------------------------------------------------ */

type Handler = (request: Request, segment: { params: Promise<never> }) => Promise<Response>;
type CallOptions = { as?: string | null; body?: unknown; raw?: Uint8Array; params?: Record<string, string>; origin?: string | null; headers?: Record<string, string>; method?: string; url?: string };

/** Invokes a route handler the way the Worker would. `as` sets the authenticated user (see the auth mock in each test file). */
export async function call(handler: Handler, options: CallOptions = {}) {
  const method = options.method ?? 'POST';
  const headers = new Headers(options.headers);
  if (options.origin !== null) headers.set('origin', options.origin ?? SITE);
  if (options.as) headers.set('x-test-user', options.as);
  headers.set('cf-connecting-ip', headers.get('cf-connecting-ip') ?? '203.0.113.10');
  let body: BodyInit | undefined;
  if (options.raw) {
    body = options.raw as unknown as BodyInit;
    headers.set('content-type', 'application/octet-stream');
  } else if (options.body !== undefined) {
    body = JSON.stringify(options.body);
    headers.set('content-type', 'application/json');
  }
  const request = new Request(options.url ?? `${SITE}/api/test`, { method, headers, body: method === 'GET' ? undefined : body });
  const response = await handler(request, { params: Promise.resolve(options.params ?? {}) as Promise<never> });
  const text = await response.text();
  let data: Record<string, unknown> = {};
  try {
    data = JSON.parse(text) as Record<string, unknown>;
  } catch {
    data = { text };
  }
  return { status: response.status, data, headers: response.headers };
}

/** Builds a signed PayMongo webhook request. */
export function webhookRequest(event: { id: string; type: string; resource: unknown; livemode?: boolean }, options: { secret?: string; timestamp?: number; tamper?: boolean } = {}) {
  const payload = JSON.stringify({ data: { id: event.id, type: 'event', attributes: { type: event.type, livemode: event.livemode ?? false, data: event.resource } } });
  const signature = signWebhookPayload(payload, options.secret ?? WEBHOOK_SECRET, { live: false, timestamp: options.timestamp });
  return new Request(`${SITE}/api/webhooks/paymongo`, { method: 'POST', headers: { 'paymongo-signature': signature, 'content-type': 'application/json' }, body: options.tamper ? payload.replace(event.id, `${event.id}x`) : payload });
}

/** Shared mock for `@/server/auth`: the session is whoever the `x-test-user` header names, loaded from the real database. */
export const authMock = () => ({
  isAdmin: (user: { role?: string | null }) => user.role === 'admin',
  getAuth: () => ({
    api: {
      getSession: async ({ headers }: { headers: Headers }) => {
        const id = headers.get('x-test-user');
        if (!id) return null;
        const row = await one<{ id: string; name: string; email: string; role: string; banned: number; two_factor_enabled: number }>('SELECT * FROM user WHERE id = ?', id);
        if (!row || row.banned) return null;
        return { session: { id: `session-${id}` }, user: { id: row.id, name: row.name, email: row.email, role: row.role, twoFactorEnabled: !!row.two_factor_enabled } };
      },
    },
  }),
});

/** Minimal valid image payloads (magic bytes + padding). */
export const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...new Array<number>(64).fill(1)]);
export const WEBP = new Uint8Array([...new TextEncoder().encode('RIFF'), 0, 0, 0, 0, ...new TextEncoder().encode('WEBPVP8 '), ...new Array<number>(64).fill(1)]);
