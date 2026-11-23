import 'server-only';
import { sql } from 'drizzle-orm';
import type { z } from 'zod';
import { getAuth, isAdmin, type SessionUser } from './auth';
import { getDb, getEnv } from './db';

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

export const json = (data: unknown, init?: ResponseInit) =>
  Response.json(data, { ...init, headers: { 'cache-control': 'no-store', ...init?.headers } });

export const clientIp = (request: Request) => request.headers.get('cf-connecting-ip') ?? '0.0.0.0';

/** CSRF defence for cookie-authenticated mutations: the Origin must be this site. */
function assertSameOrigin(request: Request) {
  const origin = request.headers.get('origin');
  const allowed = new Set([new URL(getEnv().PUBLIC_SITE_URL).origin, new URL(request.url).origin]);
  if (!origin || !allowed.has(origin)) throw new ApiError(403, 'Cross-site request blocked', 'bad_origin');
}

/**
 * Fixed-window rate limit backed by D1 (one atomic upsert). Shared across isolates.
 * Returns silently when allowed, throws 429 otherwise.
 */
export async function rateLimit(key: string, max: number, windowSeconds: number) {
  const now = Date.now();
  const windowStart = now - windowSeconds * 1000;
  const id = `app:${key}`;
  const rows = await getDb().all<{ count: number }>(sql`
    INSERT INTO rate_limit (id, key, count, last_request) VALUES (${id}, ${id}, 1, ${now})
    ON CONFLICT(key) DO UPDATE SET
      count = CASE WHEN last_request < ${windowStart} THEN 1 ELSE count + 1 END,
      last_request = CASE WHEN last_request < ${windowStart} THEN ${now} ELSE last_request END
    RETURNING count`);
  if ((rows[0]?.count ?? 1) > max) throw new ApiError(429, 'Too many requests. Please try again later.', 'rate_limited');
}

export async function verifyTurnstile(token: string | null | undefined, ip: string) {
  if (!token) throw new ApiError(400, 'Please complete the verification challenge.', 'captcha_required');
  const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ secret: getEnv().TURNSTILE_SECRET_KEY, response: token, remoteip: ip }),
  });
  const result = (await res.json()) as { success: boolean };
  if (!result.success) throw new ApiError(400, 'Verification failed. Please try again.', 'captcha_failed');
}

type Access = 'public' | 'user' | 'admin';
type Ctx<A extends Access, P> = {
  request: Request;
  params: P;
  ip: string;
  user: A extends 'public' ? SessionUser | null : SessionUser;
};
type Options<A extends Access> = { access: A; limit?: { max: number; windowSeconds: number; name: string } };

/**
 * Wraps a route handler with: same-origin check on mutations, session + role checks,
 * optional rate limiting and uniform JSON error responses. Authorisation always happens here, server-side.
 */
export function route<A extends Access, P = Record<string, string>>(
  options: Options<A>,
  handler: (ctx: Ctx<A, P>) => Promise<Response | object | void>,
) {
  return async (request: Request, segment: { params: Promise<P> }) => {
    try {
      if (!['GET', 'HEAD'].includes(request.method)) assertSameOrigin(request);
      const ip = clientIp(request);
      const session = await getAuth().api.getSession({ headers: request.headers });
      const user = session?.user ?? null;
      if (options.access !== 'public' && !user) throw new ApiError(401, 'Please sign in to continue.', 'unauthenticated');
      if (options.access === 'admin' && (!user || !isAdmin(user) || !user.twoFactorEnabled))
        throw new ApiError(403, 'Administrator access required.', 'forbidden');
      if (options.limit) await rateLimit(`${options.limit.name}:${user?.id ?? ip}`, options.limit.max, options.limit.windowSeconds);
      const result = await handler({ request, params: await segment.params, ip, user: user as Ctx<A, P>['user'] });
      if (result instanceof Response) return result;
      return json(result ?? { ok: true });
    } catch (error) {
      if (error instanceof ApiError)
        return json({ error: error.message, code: error.code, details: error.details }, { status: error.status });
      console.error('[api] unhandled error', request.method, new URL(request.url).pathname, error);
      return json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
    }
  };
}

/** Parses and validates a JSON body; rejects oversized or malformed payloads. */
export async function parseBody<S extends z.ZodType>(request: Request, schema: S, maxBytes = 100_000): Promise<z.infer<S>> {
  const text = await request.text();
  if (text.length > maxBytes) throw new ApiError(413, 'Request is too large.');
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new ApiError(400, 'Invalid request body.');
  }
  const parsed = schema.safeParse(data);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    throw new ApiError(422, first?.message ?? 'Invalid input.', 'validation', parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })));
  }
  return parsed.data;
}
