// Prepares an ISOLATED environment for the browser and smoke tests:
//   - its own database / storage folder (.wrangler/e2e-state) — your local dev data is never touched
//   - its own secrets file (.wrangler/e2e.env) with NO PayMongo, Resend or Google keys, so tests use the
//     built-in payment simulator and never call a real provider, whatever is in your .dev.vars
// Usage: pnpm e2e:prepare
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';

const STATE = '.wrangler/e2e-state';
const run = (args) => execFileSync('pnpm', ['exec', ...args], { stdio: 'inherit', shell: true });

rmSync(STATE, { recursive: true, force: true });
mkdirSync('.wrangler', { recursive: true });
writeFileSync(
  '.wrangler/e2e.env',
  [
    `BETTER_AUTH_SECRET=${randomBytes(32).toString('base64')}`,
    'TURNSTILE_SECRET_KEY=1x0000000000000000000000000000000AA', // Cloudflare's always-pass test secret
    'RESEND_API_KEY=',
    'PAYMONGO_SECRET_KEY=',
    'PAYMONGO_WEBHOOK_SECRET=whsk_e2e',
    `CRON_SECRET=${randomBytes(32).toString('hex')}`,
    'GOOGLE_CLIENT_ID=',
    'GOOGLE_CLIENT_SECRET=',
    'NEXTJS_ENV=development',
    '',
  ].join('\n'),
);
run(['wrangler', 'd1', 'migrations', 'apply', 'tibay', '--local', '--persist-to', STATE]);
execFileSync('node', ['scripts/seed.mjs', '--persist-to', STATE], { stdio: 'inherit' });
console.log('\nE2E environment ready. Start it with:\n  pnpm e2e:serve');
