// End-to-end smoke test over HTTP against a running instance seeded with `pnpm db:seed`.
// Usage: node scripts/smoke.mjs [baseUrl]     (default http://localhost:8787 = `wrangler dev` on the built Worker)
// Requires local mock-payment mode (no PayMongo key) and the Turnstile test secret.
const BASE = process.argv[2] ?? 'http://localhost:8787';
const PASSWORD = 'tibay-dev-password';
let failures = 0;

function check(name, condition, detail = '') {
  if (!condition) failures++;
  console.log(`${condition ? 'PASS' : 'FAIL'}  ${name}${condition ? '' : `  → ${detail}`}`);
}

function client() {
  const jar = new Map();
  return async (path, { method = 'GET', body, raw, headers = {} } = {}) => {
    const response = await fetch(`${BASE}${path}`, {
      method,
      redirect: 'manual',
      headers: {
        origin: BASE,
        cookie: [...jar].map(([k, v]) => `${k}=${v}`).join('; '),
        ...(body ? { 'content-type': 'application/json' } : {}),
        ...(raw ? { 'content-type': 'image/png' } : {}),
        ...headers,
      },
      body: raw ?? (body ? JSON.stringify(body) : undefined),
    });
    for (const cookie of response.headers.getSetCookie()) {
      const [pair] = cookie.split(';');
      const index = pair.indexOf('=');
      jar.set(pair.slice(0, index), pair.slice(index + 1));
    }
    const text = await response.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {}
    return { status: response.status, text, json, headers: response.headers };
  };
}

async function login(email) {
  const http = client();
  const started = Date.now();
  const response = await http('/api/auth/sign-in/email', { method: 'POST', body: { email, password: PASSWORD }, headers: { 'x-captcha-response': 'smoke-token' } });
  check(`sign in as ${email} (${Date.now() - started} ms)`, response.status === 200, `${response.status} ${response.text.slice(0, 200)}`);
  return http;
}

const anon = client();

// Public pages
for (const path of ['/', '/directory', '/directory?profession=architect', '/pricing', '/about', '/contact', '/privacy', '/terms', '/login', '/register', '/p/jdc-builders', '/robots.txt', '/sitemap.xml']) {
  const response = await anon(path);
  check(`GET ${path}`, response.status === 200, String(response.status));
}
const home = await anon('/');
check('security headers present', !!home.headers.get('content-security-policy') && home.headers.get('x-frame-options') === 'DENY' && home.headers.get('x-content-type-options') === 'nosniff');
check('directory filter works', (await anon('/directory?profession=architect')).text.includes('Santos Architects') && !(await anon('/directory?profession=architect')).text.includes('JDC Builders'));
check('unknown profile is 404', (await anon('/p/does-not-exist')).status === 404);
check('private page redirects to login', [302, 303, 307].includes((await anon('/quotations')).status));
check('admin redirects to login', [302, 303, 307].includes((await anon('/admin')).status));
check('unauthenticated API write is 401', (await anon('/api/projects', { method: 'POST', body: { title: 'x' } })).status === 401);
check('cross-site API write is 403', (await anon('/api/projects', { method: 'POST', body: { title: 'x' }, headers: { origin: 'https://evil.example' } })).status === 403);
check('unsigned webhook is 401', (await anon('/api/webhooks/paymongo', { method: 'POST', body: { data: { id: 'evt' } } })).status === 401);
check('cron endpoint hidden', (await anon('/api/cron/daily', { method: 'POST' })).status === 404);
check('wrong password rejected', (await anon('/api/auth/sign-in/email', { method: 'POST', body: { email: 'free@tibay.test', password: 'wrong-password-1' }, headers: { 'x-captcha-response': 't' } })).status === 401);

// Free user: portfolio, uploads, quotations, limits
const free = await login('free@tibay.test');
check('owner sees edit controls', (await free('/p/jdc-builders')).text.includes('This is your profile.'));
check('visitor does not', !(await anon('/p/jdc-builders')).text.includes('This is your profile.'));
check('non-admin API is 403', (await free('/api/admin/export/users')).status === 403);
check('non-admin page is redirected', [302, 303, 307].includes((await free('/admin')).status));

const projectA = await free('/api/projects', { method: 'POST', body: { title: 'Smoke project', description: 'Created by smoke test', location: 'Cebu', year: 2026 } });
check('create 3rd project (Free allows 3)', projectA.status === 200, projectA.text);
check('4th project blocked by plan', (await free('/api/projects', { method: 'POST', body: { title: 'Too many', description: '', location: '', year: null } })).status === 402);

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
const photo = await free(`/api/projects/${projectA.json?.id}/photos`, { method: 'POST', raw: png });
check('upload photo to R2', photo.status === 200, photo.text);
const image = await anon(photo.json?.url ?? '/img/none');
check('photo served with safe headers', image.status === 200 && image.headers.get('content-type') === 'image/png' && image.headers.get('cache-control')?.includes('immutable'), `${image.status}`);
check('SVG upload rejected', (await free('/api/profile/image?kind=avatar', { method: 'PUT', raw: Buffer.from('<svg onload="alert(1)"/>') })).status === 415);
check('cover photo is Premium-only', (await free('/api/profile/image?kind=cover', { method: 'PUT', raw: png })).status === 402);

const quote = { clientName: 'Smoke Client', issueDate: '2026-11-23', validUntil: '2026-12-23', items: [{ type: 'material', description: 'Cement', quantity: 40, unit: 'bags', unitPrice: 26050 }], discountType: 'percent', discountValue: 1000, taxRateBps: 1200 };
const q1 = await free('/api/quotations', { method: 'POST', body: quote });
check('create quotation', q1.status === 200 && /^Q-\d{6}-001$/.test(q1.json?.number ?? ''), q1.text);
check('quotation page shows server total ₱10,503.36', (await free(`/quotations/${q1.json?.id}`)).text.includes('10,503.36'));
await free('/api/quotations', { method: 'POST', body: quote });
check('duplicate uses quota (3rd)', (await free(`/api/quotations/${q1.json?.id}/duplicate`, { method: 'POST' })).status === 200);
check('4th quotation this month blocked', (await free('/api/quotations', { method: 'POST', body: quote })).status === 402);

// Another user cannot touch it
const other = await login('expired@tibay.test');
check('IDOR: other user cannot edit project', (await other(`/api/projects/${projectA.json?.id}`, { method: 'PATCH', body: { title: 'Hacked', description: '', location: '', year: null } })).status === 404);
check('IDOR: other user cannot open quotation', (await other(`/quotations/${q1.json?.id}`)).status === 404);
check('expired subscriber is treated as Free', (await other('/account/subscription')).text.includes('ended on'));

// Upgrade through the payment simulator
check('fake success URL grants nothing', (await free('/api/billing/verify', { method: 'POST', body: { paymentId: '3f2b8c1e-1a2b-4c3d-9e8f-0123456789ab' } })).status === 404);
const checkout = await free('/api/billing/checkout', { method: 'POST', body: { interval: 'monthly', amount: 1 } });
check('checkout started (mock gateway)', checkout.status === 200 && checkout.json?.checkoutUrl?.includes('/dev/checkout/'), checkout.text);
check('still Free before payment', (await free('/api/projects', { method: 'POST', body: { title: 'x2', description: '', location: '', year: null } })).status === 402);
const paid = await free('/api/dev/mock-pay', { method: 'POST', body: { paymentId: checkout.json?.paymentId, outcome: 'paid' } });
check('simulated payment applied', paid.json?.result === 'applied', paid.text);
check('replayed payment is a no-op', (await free('/api/dev/mock-pay', { method: 'POST', body: { paymentId: checkout.json?.paymentId, outcome: 'paid' } })).json?.result === 'already_applied');
check('Premium unlocked: 4th project allowed', (await free('/api/projects', { method: 'POST', body: { title: 'Premium project', description: '', location: '', year: null } })).status === 200);
check('Premium unlocked: cover photo allowed', (await free('/api/profile/image?kind=cover', { method: 'PUT', raw: png })).status === 200);
check('subscription page shows Premium', (await free('/account/subscription')).text.includes('Premium is active until'));

console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll smoke checks passed');
process.exit(failures ? 1 : 0);
