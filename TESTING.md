# Testing

## Summary

| Suite | Tool | Count | Runs against |
|---|---|---|---|
| Unit | Vitest | 57 | Pure functions in Node |
| Integration | Vitest + Miniflare (via `wrangler`'s `getPlatformProxy`) | 63 | Real route handlers with real in-memory D1 and R2 |
| End-to-end | Playwright (Chromium, desktop + phone viewport) | 16 | The built Worker in the local Workers runtime |
| Smoke | Node scripts over HTTP | ~50 + 28 checks | The built Worker in the local Workers runtime |

```bash
pnpm lint && pnpm typecheck
pnpm test                    # unit + integration (~1.5 min)

pnpm build:worker            # e2e and smoke tests use the built Worker
pnpm db:migrate:local && pnpm db:seed
pnpm exec playwright install chromium   # once
pnpm test:e2e

# Smoke tests: start the Worker, then run the scripts (each expects a fresh seed)
pnpm exec wrangler dev --port 8787 --var PUBLIC_SITE_URL:http://localhost:8787
node scripts/smoke.mjs
pnpm db:seed && node scripts/smoke-admin.mjs
```

The seed, e2e and smoke tests modify the **local** database only. Re-run `pnpm db:seed` between runs.

## How the integration tests work

`tests/integration/harness.ts` starts Miniflare's D1 and R2 (no persistence), applies every file in `migrations/`, and installs that environment for the server modules. Route handlers are imported and called directly with real `Request` objects. Only two things are faked:

- **The session lookup** (`@/server/auth`): the user named by an `x-test-user` header is loaded from the real `user` table. Authorisation, ownership checks, rate limits and all SQL are the production code.
- **Outbound HTTP** (PayMongo, Turnstile, Resend): a `fetch` stub that records requests and plays PayMongo's part, including whether a checkout session is paid.

This means the SQL-level guarantees (atomic limits, the payment transaction) are exercised against a real SQLite engine, including under `Promise.all` concurrency.

## Coverage by requirement

### Unauthorized access
- Every protected endpoint returns 401 without a session; cross-site and Origin-less writes return 403 even with a session; banned users are rejected (integration, e2e, smoke).
- Admin endpoints return 403 for normal users **and** for admins without 2FA; admin pages redirect (integration, e2e, admin smoke).
- IDOR: a second user cannot edit, delete, duplicate or view another user's project, photo or quotation, and cannot verify another user's payment — all 404 (integration, smoke).
- Mass-assignment: extra fields such as `userId`, `status`, `username` in a profile update are ignored (integration).
- Cron endpoint is 404 without the shared secret; the payment simulator is 404 when a PayMongo key exists (integration).

### Subscription bypass
- 8 parallel project creations on Free → exactly 3 succeed; same for monthly quotations; the 11th photo is refused (integration).
- Deleting a quotation does not refund quota; duplicating consumes quota (integration).
- Premium-only cover photo and quotation history return 402 on Free (integration, smoke).
- A subscription whose period has ended is treated as Free immediately, even while its row still says `active` (integration).
- Visiting a "success" URL or calling verify for an unpaid session grants nothing (integration, e2e, smoke).
- The client cannot set the price: extra `amount` fields are ignored and the server price is what is sent to PayMongo (integration).

### Duplicate payments
- The same webhook delivered three times concurrently, plus the browser's verify call racing it, plus a later replay under a new event id → one subscription period, one `payment.paid` audit entry, one email (integration).
- One PayMongo payment id cannot pay for two checkouts (integration).
- Simulator replay returns `already_applied` (smoke).

### Payment simulation and webhooks
- Signature: unsigned, wrong secret, tampered body, stale timestamp, future timestamp, test-vs-live mismatch and malformed headers are rejected (unit + integration); invalid signatures are audited.
- A correctly signed event claiming a payment that PayMongo's API does not confirm changes nothing (integration).
- Underpayment (₱1 for an annual plan), wrong environment, and sessions the app never created are rejected and audited (integration).
- Success path records fee and net, activates the right period length for monthly and annual, emails the customer (integration).
- Failed payment recorded; a later success on the same session is still honoured (integration).
- Full refund revokes Premium once; repeated refund events are idempotent (integration).
- PayMongo outage during checkout creation fails cleanly (integration).

### Expired subscriptions
- Daily job marks lapsed subscriptions `expired`, emails the owner, and deletes nothing (integration).
- One renewal reminder per period; none after the user cancels; cancelling keeps access until period end (integration).
- Early renewal stacks onto remaining time; renewal after expiry starts a fresh period (integration).
- Abandoned checkouts are closed after a day, yet a late payment on one is still applied (integration).

### Malicious uploads
- SVG with script, HTML, PHP, executables, GIF, PDF, empty and oversized files are rejected regardless of claimed type (unit + integration + smoke).
- Stored keys are server-generated; `/img` rejects path traversal and foreign prefixes and serves with `nosniff` and a fixed content type (unit + integration).
- Replacing an image deletes the old object; orphan cleanup removes unreferenced objects only after the grace period (integration).

### Incorrect quotation calculations
- Integer-centavo maths for classic floating-point traps (0.1 × 3, 1.1 × 1.10), half-up rounding, percentage and fixed discounts, discount capped at subtotal, VAT on the discounted amount, 100-line no-drift check (unit).
- Invalid quotations rejected: no items, zero quantity, negative or fractional-centavo prices, >100% discount or tax, validity before issue date, absurd amounts (unit + integration).
- The server recomputes totals and ignores client-supplied totals (integration).
- Browser: a typed quotation shows ₱10,503.36 live, saves with the same total, and downloads a PDF (e2e).

### Admin metrics
- MRR normalises annual plans (price ÷ 12), ARR = MRR × 12, complimentary grants contribute ₱0 (unit); verified against seeded data on the rendered dashboard: ₱571.17 / ₱6,854.04 (admin smoke).
- Collections, fees, refunds and net are computed from `payments` and match direct SQL sums; recurring revenue and cash collected are separate figures (integration).
- CSV export escapes quotes and neutralises spreadsheet formulas (unit).

### Admin area
- Real TOTP enrolment (script computes RFC 6238 codes), wrong code rejected, then all 12 admin pages render; ban/unban hides and restores a public profile; export and audit entries appear (admin smoke).

### Responsive and accessibility
- Ten public pages checked on desktop and a Pixel 7 viewport for: exactly one `<h1>`, a title, `lang`, no horizontal overflow, no image without `alt` (e2e).
- Built in: labelled form controls with associated hints/errors, focus-visible outlines, skip link, Radix dialogs and menus (focus trap, Escape, ARIA), table headers with scope, reduced-motion support, text contrast from the design tokens, charts with a table alternative.
- **Not done:** an automated axe scan and manual screen-reader testing. Recommended before launch.

### Performance
- Worker bundle: **2.28 MiB gzipped** (free-plan limit 3 MiB) — reported by the CI dry-run step.
- Sign-in (scrypt) measured at ~170–200 ms wall-clock in the local Workers runtime.
- Pagination uses `LIMIT n+1` instead of `COUNT(*)`; directory and admin lists are single indexed queries; PDF, QR and the location list are lazy-loaded in the browser.
- **Not done:** load testing and Lighthouse runs against a deployed environment — these need the real Cloudflare network to be meaningful.

## Regression

CI (`.github/workflows/ci.yml`) runs lint, typecheck, unit + integration tests, the Worker build and a deploy dry-run on every push and pull request, then the Playwright suite against the built Worker.

## Known gaps

- PayMongo itself is simulated. One real test-mode payment and webhook must be run before going live (`DEPLOYMENT.md`, step 7) — in particular to confirm the webhook signature format.
- The Playwright login relies on Cloudflare's Turnstile test widget, so e2e needs internet access.
- No tests for email rendering beyond "was sent with the right subject and recipient".
