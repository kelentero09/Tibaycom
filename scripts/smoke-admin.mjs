// Admin smoke test: real 2FA enrolment (TOTP), then every admin page, an admin action, an export and the audit trail.
// Usage: node scripts/smoke-admin.mjs [baseUrl]   — needs a freshly seeded local database (`pnpm db:seed`).
import { createHmac } from 'node:crypto';

const BASE = process.argv[2] ?? 'http://localhost:8787';
const PASSWORD = 'tibay-dev-password';
let failures = 0;
const check = (name, ok, detail = '') => {
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  → ${detail}`}`);
};

const jar = new Map();
async function http(path, { method = 'GET', body } = {}) {
  const response = await fetch(`${BASE}${path}`, {
    method,
    redirect: 'manual',
    headers: { origin: BASE, cookie: [...jar].map(([k, v]) => `${k}=${v}`).join('; '), 'x-captcha-response': 'smoke', ...(body ? { 'content-type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  for (const cookie of response.headers.getSetCookie()) {
    const [pair] = cookie.split(';');
    const index = pair.indexOf('=');
    if (pair.slice(index + 1)) jar.set(pair.slice(0, index), pair.slice(index + 1));
    else jar.delete(pair.slice(0, index));
  }
  const text = await response.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {}
  return { status: response.status, text, json, location: response.headers.get('location') };
}

// RFC 6238 TOTP (SHA-1, 6 digits, 30 s) — what an authenticator app computes.
function totp(base32Secret) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const char of base32Secret.replace(/=+$/, '').toUpperCase()) bits += alphabet.indexOf(char).toString(2).padStart(5, '0');
  const key = Buffer.from(bits.match(/.{8}/g).map((b) => parseInt(b, 2)));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30_000)));
  const digest = createHmac('sha1', key).update(counter).digest();
  const offset = digest[digest.length - 1] & 0xf;
  return String((digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).padStart(6, '0');
}

const signIn = await http('/api/auth/sign-in/email', { method: 'POST', body: { email: 'admin@tibay.test', password: PASSWORD } });
check('admin signs in with password', signIn.status === 200, `${signIn.status} ${signIn.text.slice(0, 150)}`);

const gated = await http('/admin');
check('admin WITHOUT 2FA is sent to security settings', [302, 303, 307].includes(gated.status) && (gated.location ?? '').includes('/account/security'), `${gated.status} ${gated.location}`);
check('admin API refuses without 2FA', (await http('/api/admin/export/users')).status === 403);

const enable = await http('/api/auth/two-factor/enable', { method: 'POST', body: { password: PASSWORD } });
const secret = enable.json?.totpURI ? new URL(enable.json.totpURI).searchParams.get('secret') : null;
check('2FA enrolment returns a TOTP secret and backup codes', !!secret && enable.json?.backupCodes?.length > 0, enable.text.slice(0, 200));
check('wrong TOTP code is rejected', (await http('/api/auth/two-factor/verify-totp', { method: 'POST', body: { code: '000000' } })).status !== 200);
const verify = await http('/api/auth/two-factor/verify-totp', { method: 'POST', body: { code: secret ? totp(secret) : '' } });
check('correct TOTP code enables 2FA', verify.status === 200, `${verify.status} ${verify.text.slice(0, 200)}`);

for (const path of ['/admin', '/admin?from=2026-01-01&to=2026-11-30', '/admin/users', '/admin/users?q=santos&status=premium', '/admin/profiles', '/admin/profiles/seedp_jdc_builders', '/admin/subscriptions', '/admin/transactions', '/admin/reports', '/admin/audit', '/admin/settings', '/admin/system']) {
  const page = await http(path);
  check(`GET ${path}`, page.status === 200 && !page.text.includes('Something went wrong'), `${page.status} ${page.location ?? ''}`);
}
const overview = (await http('/admin')).text;
check('overview shows live metrics', ['Total registered users', 'MRR', 'ARR', 'Net collections in range', 'Churn rate', 'Upcoming renewals', 'Failed payments in range'].every((label) => overview.includes(label)));
// Seed: 1 annual (₱1,490 → ₱124.17/mo) + 3 monthly (₱149) active subscriptions = MRR ₱571.17, ARR ₱6,854.04
check('MRR normalises the annual plan (₱571.17)', overview.includes('571.17'), 'expected ₱571.17');
check('ARR = MRR × 12 (₱6,854.04)', overview.includes('6,854.04'), 'expected ₱6,854.04');

const ban = await http('/api/admin/actions/user.ban', { method: 'POST', body: { userId: 'seed_lakas_steel_works', reason: 'Smoke test' } });
check('admin can ban a user', ban.status === 200, ban.text);
check('banned profile disappears from the public site', (await fetch(`${BASE}/p/lakas-steel-works`)).status === 404);
check('admin can unban', (await http('/api/admin/actions/user.unban', { method: 'POST', body: { userId: 'seed_lakas_steel_works' } })).status === 200);
check('profile is public again', (await fetch(`${BASE}/p/lakas-steel-works`)).status === 200);

const csv = await http('/api/admin/export/transactions');
check('CSV export works', csv.status === 200 && csv.text.includes('providerPaymentId'), `${csv.status}`);
const audit = (await http('/admin/audit')).text;
check('actions appear in the audit log', audit.includes('admin.user.ban') && audit.includes('admin.export'));

const settings = await http('/api/admin/actions/settings.plans', { method: 'POST', body: { pricing: { monthly: -1, annual: 0 } } });
check('invalid plan settings are rejected', settings.status === 422, `${settings.status}`);

console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll admin smoke checks passed');
process.exit(failures ? 1 : 0);
