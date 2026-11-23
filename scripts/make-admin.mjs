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
// Administrators must use password + two-factor: any linked Google/Facebook login is removed on promotion.
const command = `DELETE FROM account WHERE provider_id != 'credential' AND user_id IN (SELECT id FROM user WHERE email = '${email.toLowerCase()}'); UPDATE user SET role = 'admin', updated_at = unixepoch() * 1000 WHERE email = '${email.toLowerCase()}' AND email_verified = 1 RETURNING id, email, role;`;
execFileSync('pnpm', ['exec', 'wrangler', 'd1', 'execute', 'tibay', remote ? '--remote' : '--local', '--command', JSON.stringify(command)], { stdio: 'inherit', shell: true });
console.log('\nIf no row was returned, the email does not exist or is not verified yet.');
