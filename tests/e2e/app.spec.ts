import { expect, test, type Page } from '@playwright/test';

// Accounts created by `pnpm db:seed` (development data only).
const PASSWORD = 'tibay-dev-password';
const FREE = 'free@tibay.test';
const PREMIUM = 'premium@tibay.test';

async function login(page: Page, email: string) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(PASSWORD);
  // Wait for Turnstile (always-pass test key) to issue its token, then submit exactly once:
  // repeated clicks would run into the sign-in rate limit, which is itself under test elsewhere.
  await expect(page.locator('[name="cf-turnstile-response"]')).toHaveValue(/.+/, { timeout: 45_000 });
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page).toHaveURL(/\/p\//, { timeout: 30_000 });
}

test.describe('public site', () => {
  test('landing page explains the product and links to sign-up', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Filipino builders');
    await expect(page.getByRole('link', { name: /Create your free profile/ }).first()).toHaveAttribute('href', '/register');
    await expect(page.getByText('₱399').first()).toBeVisible();
  });

  test('pages have exactly one h1, a title, a lang attribute and no horizontal overflow', async ({ page }) => {
    for (const path of ['/', '/directory', '/pricing', '/about', '/contact', '/privacy', '/terms', '/login', '/register', '/p/santos-architects']) {
      await page.goto(path);
      await expect(page.locator('h1'), path).toHaveCount(1);
      expect((await page.title()).length, path).toBeGreaterThan(5);
      await expect(page.locator('html')).toHaveAttribute('lang', 'en-PH');
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, `${path} overflows horizontally`).toBeLessThanOrEqual(1);
      // Every image needs alt text (empty alt is allowed for decorative images).
      expect(await page.locator('img:not([alt])').count(), `${path} has images without alt`).toBe(0);
    }
  });

  test('directory filters by profession and province', async ({ page }) => {
    await page.goto('/directory?profession=architect');
    await expect(page.getByRole('link', { name: /Santos Architects/ })).toBeVisible();
    await expect(page.getByRole('link', { name: /JDC Builders/ })).toHaveCount(0);

    await page.goto('/directory?province=Cebu');
    await expect(page.getByRole('link', { name: /JDC Builders/ })).toBeVisible();

    await page.goto('/directory?q=zzzz-no-such-business');
    await expect(page.getByText('No professionals match your search')).toBeVisible();
  });

  test('a visitor can view a profile without an account and sees no edit controls', async ({ page }) => {
    await page.goto('/p/jdc-builders');
    await expect(page.getByRole('heading', { level: 1, name: 'JDC Builders' })).toBeVisible();
    await expect(page.getByRole('button', { name: /Request a quotation/ }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Edit profile' })).toHaveCount(0);
    // Free plan carries platform branding (checked on a seeded profile that no test upgrades).
    await page.goto('/p/bato-masonry');
    await expect(page.getByText('Made with')).toBeVisible();
    await page.goto('/p/santos-architects');
    await expect(page.getByText('Made with')).toHaveCount(0); // Premium removes it
  });

  test('switches the interface to Filipino and back', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /Switch language to Filipino/ }).click();
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Pilipinong builder');
    await expect(page.locator('html')).toHaveAttribute('lang', 'fil-PH');
    await expect(page.getByRole('link', { name: 'Gumawa ng libreng profile' }).first()).toBeVisible();
    await page.getByRole('button', { name: /Switch language to English/ }).click();
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Filipino builders');
  });

  test('SEO endpoints respond', async ({ request }) => {
    const robots = await request.get('/robots.txt');
    const rules = await robots.text();
    expect(rules).toContain('Disallow: /admin');
    expect(rules).toContain('Disallow: /q/');
    const sitemap = await request.get('/sitemap.xml');
    expect(await sitemap.text()).toContain('/p/jdc-builders');
    expect((await request.get('/p/this-profile-does-not-exist')).status()).toBe(404);
  });
});

test.describe('access control', () => {
  test('signed-out visitors are sent to login from private pages', async ({ page }) => {
    for (const path of ['/quotations', '/account/subscription', '/account/security', '/admin', '/admin/users', '/onboarding']) {
      await page.goto(path);
      await expect(page, path).toHaveURL(/\/login/);
    }
  });

  test('API rejects unauthenticated and cross-site writes', async ({ request, baseURL }) => {
    const origin = baseURL!;
    expect((await request.post('/api/projects', { data: { title: 'x' }, headers: { origin } })).status()).toBe(401);
    expect((await request.post('/api/admin/actions/user.ban', { data: { userId: 'x' }, headers: { origin } })).status()).toBe(401);
    expect((await request.get('/api/admin/export/users')).status()).toBe(401);
    expect((await request.post('/api/projects', { data: { title: 'x' }, headers: { origin: 'https://evil.example' } })).status()).toBe(403);
    expect((await request.post('/api/webhooks/paymongo', { data: { data: { id: 'evt_x' } } })).status()).toBe(401);
    expect((await request.post('/api/cron/daily')).status()).toBe(404);
  });

  test('a regular user cannot open the admin area', async ({ page }) => {
    await login(page, FREE);
    await page.goto('/admin');
    await expect(page).not.toHaveURL(/\/admin/);
    const response = await page.request.get('/api/admin/export/users');
    expect(response.status()).toBe(403);
  });
});

test.describe('professional workflow', () => {
  test('owner sees inline editing on their own profile only', async ({ page }) => {
    await login(page, FREE);
    await expect(page.getByText('This is your profile.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Edit profile' })).toBeVisible();
    await page.goto('/p/santos-architects');
    await expect(page.getByRole('button', { name: 'Edit profile' })).toHaveCount(0);
  });

  test('creates a quotation with correct totals', async ({ page }) => {
    await login(page, PREMIUM);
    await page.goto('/quotations/new');
    await page.getByLabel('Client name').fill('E2E Client');
    await page.getByLabel('Description').first().fill('Portland cement');
    await page.getByLabel('Qty').first().fill('40');
    await page.getByLabel('Unit', { exact: true }).first().fill('bags');
    await page.getByLabel('Unit price (₱)').first().fill('260.50');
    // 40 × 260.50 = 10,420.00 ; 10% discount = 1,042.00 ; 12% VAT on 9,378.00 = 1,125.36 ; total 10,503.36
    await page.getByLabel('Discount', { exact: true }).selectOption('percent');
    await page.getByLabel('Percent').fill('10');
    await page.getByRole('button', { name: '12% VAT' }).click();
    await expect(page.getByTestId('grand-total')).toHaveText('₱10,503.36');

    await page.getByRole('button', { name: 'Save quotation' }).click();
    await expect(page).toHaveURL(/\/quotations\/[0-9a-f-]{36}$/);
    await expect(page.getByText('₱10,503.36').first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Download PDF' })).toBeVisible();

    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download PDF' }).click();
    expect((await download).suggestedFilename()).toMatch(/^Q-\d{6}-\d{3}-E2E-Client\.pdf$/);
  });

  test('a client request reaches the inbox, and a quotation can be shared by link', async ({ page, browser, baseURL }) => {
    // 1) A visitor (no account) sends a request from the public profile.
    const visitor = await browser.newContext();
    const visit = await visitor.newPage();
    await visit.goto('/p/santos-architects');
    await visit.getByRole('button', { name: /Request a quotation/ }).first().click();
    await visit.getByLabel('Your name').fill('E2E Visitor');
    await visit.getByLabel('Mobile number or email').fill('0917 000 1234');
    await visit.getByLabel('Project details').fill('Please quote a two-storey house design in Pasig.');
    await expect(visit.locator('[role="dialog"] [name="cf-turnstile-response"]')).toHaveValue(/.+/, { timeout: 45_000 });
    await visit.getByRole('button', { name: 'Send request' }).click();
    await expect(visit.getByText(/Your request was sent/)).toBeVisible();

    // 2) The professional finds it in their inbox, marked new.
    await login(page, PREMIUM);
    await page.goto('/inbox');
    await expect(page.getByText('E2E Visitor')).toBeVisible();
    await expect(page.getByText('New', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Mark as read' }).click();
    await expect(page.getByText('New', { exact: true })).toHaveCount(0);

    // 3) They create a quotation and share it by link.
    const created = await page.request.post('/api/quotations', {
      headers: { origin: baseURL! },
      data: { clientName: 'E2E Visitor', issueDate: '2026-11-23', validUntil: '2026-12-23', items: [{ type: 'service', description: 'Architectural design', quantity: 1, unit: 'lot', unitPrice: 8_500_000 }] },
    });
    const { id } = (await created.json()) as { id: string };
    await page.goto(`/quotations/${id}`);
    await page.getByRole('button', { name: 'Share by link' }).click();
    await page.getByRole('button', { name: 'Create link' }).click();
    const link = await page.getByRole('link', { name: 'See what they see' }).getAttribute('href');
    expect(link).toMatch(/\/q\/[A-Za-z0-9_-]{43}$/);

    // 4) The client opens it without an account: read-only, with PDF download, and not indexable.
    await visit.goto(link!);
    await expect(visit.getByText('Quotation from')).toBeVisible();
    await expect(visit.getByText('₱85,000.00').last()).toBeVisible();
    await expect(visit.getByRole('button', { name: 'Download PDF' })).toBeVisible();
    await expect(visit.getByRole('link', { name: 'Edit' })).toHaveCount(0);
    await expect(visit.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);

    // 5) Turning the link off kills it immediately.
    await page.getByRole('button', { name: 'Turn off link' }).click();
    await expect(page.getByRole('button', { name: 'Create link' })).toBeVisible();
    expect((await visit.goto(link!))?.status()).toBe(404);
    await visitor.close();
  });

  test('hitting a plan limit opens an upgrade prompt instead of an error', async ({ page, baseURL }) => {
    await login(page, FREE);
    // The seeded Free account has 1 of 2 projects; add the second through the API.
    await page.request.post('/api/projects', { headers: { origin: baseURL! }, data: { title: 'Second project', description: '', location: '', year: 2026 } });
    await page.goto('/p/jdc-builders');
    await expect(page.getByText(/You’ve used all 2 project slots/)).toBeVisible();
    await page.getByRole('button', { name: 'Add project' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText('You’ve filled every project slot')).toBeVisible();
    await expect(dialog.getByRole('link', { name: /Upgrade to Premium/ })).toHaveAttribute('href', '/account/subscription');
  });

  test('upgrade flow activates Premium only after the (simulated) gateway confirms payment', async ({ page }) => {
    await login(page, FREE);
    await page.goto('/account/subscription');
    await expect(page.getByText('Free', { exact: true }).first()).toBeVisible();

    // Visiting a made-up "success" URL must not grant anything.
    await page.goto('/account/subscription?payment=3f2b8c1e-1a2b-4c3d-9e8f-0123456789ab');
    await page.goto('/account/subscription');
    await expect(page.getByRole('button', { name: 'Upgrade to Premium' })).toBeVisible();

    await page.getByRole('button', { name: 'Upgrade to Premium' }).click();
    await expect(page).toHaveURL(/\/dev\/checkout\//);
    await page.getByRole('button', { name: 'Simulate successful payment' }).click();
    await expect(page.getByText(/Premium is active until/)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText('paid').first()).toBeVisible();
  });
});
