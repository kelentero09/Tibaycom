// DEVELOPMENT-ONLY seed data for the LOCAL D1 database.
// Usage: pnpm db:seed                              (your local dev database — REPLACES everything in it)
//        node scripts/seed.mjs --persist-to <dir>  (a separate database folder, used by the e2e tests)
// It never touches a remote database: the wrangler command below is hard-coded to --local.
import { execFileSync } from 'node:child_process';
import { randomBytes, randomUUID, scryptSync } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

if (process.argv.includes('--remote') || process.env.APP_ENV === 'production') {
  console.error('Refusing to seed: this script is for local development only.');
  process.exit(1);
}

export const DEV_PASSWORD = 'tibay-dev-password';
const locations = JSON.parse(readFileSync(new URL('../src/data/ph-locations.json', import.meta.url), 'utf8'));
const now = Date.now();
const DAY = 86_400_000;

// Same parameters as src/server/password.ts
function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const key = scryptSync(password.normalize('NFKC'), salt, 64, { N: 16384, r: 16, p: 1, maxmem: 128 * 16384 * 16 * 2 });
  return `${salt}:${key.toString('hex')}`;
}
const passwordHash = hashPassword(DEV_PASSWORD);

const q = (value) => (value === null || value === undefined ? 'NULL' : typeof value === 'number' ? String(value) : `'${String(value).replace(/'/g, "''")}'`);
const insert = (table, row) => `INSERT INTO ${table} (${Object.keys(row).join(', ')}) VALUES (${Object.values(row).map(q).join(', ')});`;
const cityOf = (province, index = 0) => locations[province][index % locations[province].length];
const sql = [];

function addUser({ name, email, role = 'user', daysAgo = 30 }) {
  const id = `seed_${email.split('@')[0].replace(/[^a-z0-9]/g, '_')}`;
  const createdAt = now - daysAgo * DAY;
  sql.push(insert('user', { id, name, email, email_verified: 1, role, banned: 0, two_factor_enabled: 0, created_at: createdAt, updated_at: createdAt }));
  sql.push(insert('account', { id: randomUUID(), account_id: id, provider_id: 'credential', user_id: id, password: passwordHash, created_at: createdAt, updated_at: createdAt }));
  return id;
}

function addProfile(userId, { username, businessName, professions, specializations = [], province, cityIndex = 0, bio, years, services = [], daysAgo = 30 }) {
  const id = `seedp_${username.replace(/-/g, '_')}`;
  const createdAt = now - daysAgo * DAY;
  sql.push(
    insert('profiles', {
      id, user_id: userId, username, business_name: businessName, bio, services: JSON.stringify(services), years_experience: years, province, city: cityOf(province, cityIndex),
      service_areas: JSON.stringify([province]), phone: '0917 555 0100', contact_email: '', facebook_url: '', messenger_url: '', is_published: 1, status: 'active', created_at: createdAt, updated_at: createdAt,
    }),
  );
  professions.forEach((profession) => sql.push(insert('profile_professions', { profile_id: id, profession })));
  specializations.forEach((specialization) => sql.push(insert('profile_specializations', { profile_id: id, specialization })));
  return id;
}

function addProject(profileId, title, description, location, year, offset = 0) {
  sql.push(insert('projects', { id: randomUUID(), profile_id: profileId, title, description, location, year, created_at: now - (20 - offset) * DAY, updated_at: now - (20 - offset) * DAY }));
}

function addSubscription(userId, { interval, status, startDaysAgo, endInDays, price, paid = true }) {
  const start = now - startDaysAgo * DAY;
  const end = now + endInDays * DAY;
  sql.push(insert('subscriptions', { id: randomUUID(), user_id: userId, interval, status, price_amount: price, current_period_start: start, current_period_end: end, cancel_at_period_end: 0, created_at: start, updated_at: start }));
  if (paid) {
    const fee = Math.round(price * 0.025);
    const id = randomUUID();
    sql.push(
      insert('payments', {
        id, user_id: userId, interval, status: 'paid', amount: price, fee, net_amount: price - fee, refunded_amount: 0, checkout_session_id: `cs_seed_${id}`, provider_payment_id: `pay_seed_${id}`,
        payment_method: 'gcash', livemode: 0, period_start: start, period_end: end, paid_at: start, created_at: start, updated_at: start,
      }),
    );
  }
}

// --- Accounts you can log in with (password: tibay-dev-password) ---
// NOTE: the admin area also requires two-factor authentication: log in as the admin, open Account settings and set up 2FA.
addUser({ name: 'Tibay Admin', email: 'admin@tibay.test', role: 'admin', daysAgo: 120 });

const free = addUser({ name: 'Juan Dela Cruz', email: 'free@tibay.test', daysAgo: 45 });
const freeProfile = addProfile(free, {
  username: 'jdc-builders', businessName: 'JDC Builders', professions: ['general-contractor', 'foreman'], specializations: ['Residential', 'Renovation'], province: 'Cebu', cityIndex: 3,
  bio: 'Family-run contractor building and renovating homes in Cebu since 2012. Clear quotations, honest timelines.', years: 13, services: ['House construction', 'Renovation', 'Roofing'], daysAgo: 45,
});
addProject(freeProfile, 'Two-storey residence', 'Complete design-and-build of a 180 sqm family home.', 'Talisay, Cebu', 2025, 0);

const premium = addUser({ name: 'Maria Santos', email: 'premium@tibay.test', daysAgo: 90 });
const premiumProfile = addProfile(premium, {
  username: 'santos-architects', businessName: 'Santos Architects', professions: ['architect', 'interior-designer'], specializations: ['Residential Design', '3D Rendering', 'Permit Plans'], province: 'Metro Manila', cityIndex: 5,
  bio: 'Licensed architect designing practical, well-lit homes for Filipino families. Permit-ready plans and 3D walkthroughs.', years: 9, services: ['Architectural plans', '3D perspectives', 'Permit processing'], daysAgo: 90,
});
['Modern tropical house', 'Townhouse row development', 'Café interior fit-out', 'Vacation villa', 'Duplex with roof deck'].forEach((title, i) => addProject(premiumProfile, title, 'Concept to construction documents.', 'Metro Manila', 2022 + (i % 5), i));
addSubscription(premium, { interval: 'annual', status: 'active', startDaysAgo: 60, endInDays: 305, price: 399_000 });

const lapsed = addUser({ name: 'Pedro Reyes', email: 'expired@tibay.test', daysAgo: 100 });
addProfile(lapsed, { username: 'reyes-electrical', businessName: 'Reyes Electrical Services', professions: ['electrician'], specializations: ['House Wiring', 'Panel Boards'], province: 'Laguna', bio: 'Licensed electrician for residential and small commercial work.', years: 15, daysAgo: 100 });
addSubscription(lapsed, { interval: 'monthly', status: 'expired', startDaysAgo: 45, endInDays: -15, price: 39_900 });

// --- Directory filler ---
const samples = [
  ['Bayanihan Construction', 'general-contractor', 'Davao Del Sur', ['Commercial', 'Design & Build']],
  ['Lakas Steel Works', 'welder', 'Pampanga', ['Gates & Grills', 'Steel Trusses']],
  ['Agos Plumbing', 'plumber', 'Cavite', ['Leak Repair', 'Water Lines']],
  ['Kulay Painting Services', 'painter', 'Bulacan', ['Interior', 'Waterproofing']],
  ['Matatag Engineering', 'civil-engineer', 'Iloilo', ['Structural Design', 'Estimates (BOQ)']],
  ['Hanay Tile Setters', 'tile-setter', 'Batangas', ['Floor Tiles', 'Wall Tiles']],
  ['Bubong Roofing', 'roofer', 'Rizal', ['Metal Roofing', 'Gutters']],
  ['Liwanag Solar & Electrical', 'electrical-engineer', 'Negros Occidental', ['Solar PV', 'Electrical Plans']],
  ['Kahoy Carpentry', 'carpenter', 'Quezon', ['Cabinetry', 'Finishing Carpentry']],
  ['Bato Masonry', 'mason', 'Pangasinan', ['CHB Laying', 'Plastering']],
  ['Lamig Aircon Services', 'hvac-technician', 'Metro Manila', ['Installation', 'Cleaning']],
  ['Hardin Landscaping', 'landscaper', 'Benguet', ['Garden Design', 'Hardscape']],
];
samples.forEach(([businessName, profession, province, specializations], index) => {
  const username = businessName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-$/, '');
  const userId = addUser({ name: businessName, email: `${username}@tibay.test`, daysAgo: 28 - index * 2 });
  const profileId = addProfile(userId, { username, businessName, professions: [profession], specializations, province, cityIndex: index, bio: `${businessName} — reliable workmanship in ${province}.`, years: 3 + index, daysAgo: 28 - index * 2 });
  addProject(profileId, 'Recent project', 'Completed on time and within budget.', province, 2026, index % 5);
  if (index % 4 === 0) addSubscription(userId, { interval: 'monthly', status: 'active', startDaysAgo: 10, endInDays: 20, price: 39_900 });
});

sql.push(insert('reports', { id: randomUUID(), profile_id: 'seedp_lakas_steel_works', reason: 'fake', details: 'Photos look copied from another company.', reporter_email: 'visitor@example.com', status: 'open', created_at: now - DAY }));
sql.push(insert('audit_logs', { id: randomUUID(), actor_id: null, actor_type: 'system', action: 'seed.dev', metadata: JSON.stringify({ users: samples.length + 4 }), created_at: now }));

const cleanup = ['audit_logs', 'reports', 'webhook_events', 'payments', 'subscriptions', 'usage_counters', 'quotations', 'project_photos', 'projects', 'profile_specializations', 'profile_professions', 'profiles', 'two_factor', 'verification', 'session', 'account', 'user', 'rate_limit'].map((t) => `DELETE FROM ${t};`);

mkdirSync(new URL('../.wrangler/', import.meta.url), { recursive: true });
const file = new URL('../.wrangler/seed.dev.sql', import.meta.url);
writeFileSync(file, [...cleanup, ...sql].join('\n'));
const persistIndex = process.argv.indexOf('--persist-to');
const persist = persistIndex > 0 && process.argv[persistIndex + 1] ? ['--persist-to', process.argv[persistIndex + 1]] : [];
execFileSync('pnpm', ['exec', 'wrangler', 'd1', 'execute', 'tibay', '--local', ...persist, '--file', '.wrangler/seed.dev.sql'], { stdio: 'inherit', shell: true });
console.log(`\nSeeded ${samples.length + 4} users. Log in with any of:\n  free@tibay.test · premium@tibay.test · expired@tibay.test · admin@tibay.test\n  password: ${DEV_PASSWORD}`);
