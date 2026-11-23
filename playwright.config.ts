import { defineConfig, devices } from '@playwright/test';

const PORT = 8787;

/**
 * E2E runs against the BUILT Worker in the local Workers runtime (the same bundle that gets deployed),
 * using the local D1 database and the payment simulator.
 * Prepare first:  pnpm build:worker && pnpm db:migrate:local && pnpm db:seed
 */
export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: { baseURL: `http://localhost:${PORT}`, trace: 'retain-on-failure' },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    // Mobile-first check: the same flows on a phone-sized viewport.
    // The signed-in flows change data (e.g. the upgrade), so the phone profile repeats the read-only public checks.
    { name: 'mobile', use: { ...devices['Pixel 7'] }, grep: /public site/ },
  ],
  webServer: { command: `pnpm exec wrangler dev --port ${PORT} --var PUBLIC_SITE_URL:http://localhost:${PORT}`, url: `http://localhost:${PORT}`, reuseExistingServer: !process.env.CI, timeout: 180_000 },
});
