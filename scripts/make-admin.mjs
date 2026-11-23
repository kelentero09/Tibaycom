// Promotes an existing, verified account to Super Admin.
// Usage: pnpm admin:promote someone@example.com            (local database)
//        pnpm admin:promote someone@example.com --remote   (production — asks wrangler to run against the live D1)
// The admin must then enable two-factor authentication in Account settings before /admin opens.
import { execFileSync } from 'node:child_process';

const email = process.argv[2];
const remote = process.argv.includes('--remote');
if (!email || !/^[^\s@']+@[^\s@']+\.[^\s@']+$/.test(email)) {
  console.error('Usage: pnpm admin:promote <email> [--remote]');
  process.exit(1);
}
const command = `UPDATE user SET role = 'admin', updated_at = unixepoch() * 1000 WHERE email = '${email.toLowerCase()}' AND email_verified = 1 RETURNING id, email, role;`;
execFileSync('pnpm', ['exec', 'wrangler', 'd1', 'execute', 'tibay', remote ? '--remote' : '--local', '--command', JSON.stringify(command)], { stdio: 'inherit', shell: true });
console.log('\nIf no row was returned, the email does not exist or is not verified yet.');
