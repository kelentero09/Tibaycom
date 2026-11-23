# Security

How Tibay protects accounts, payments and data — and what is deliberately left to the operator. Each control names where it lives so it can be audited.

## Reporting a vulnerability
Email the address configured as `SUPPORT_EMAIL` with details and reproduction steps. Please do not open a public issue for security problems.

## Authentication and sessions (`src/server/auth.ts`, `src/server/password.ts`)

- **Better Auth**, email + password. Passwords are 10–128 characters, hashed with **scrypt** (N=16384, r=16, p=1, 64-byte key, per-password random salt) using the Workers runtime's native `node:crypto`, compared in constant time.
- **Email verification is required** before a session is issued (`requireEmailVerification`). Verification and reset links are single-purpose, expiring tokens.
- Password reset revokes all sessions. Changing the password from settings revokes other sessions.
- Session cookies are `HttpOnly`, `SameSite=Lax` and `Secure` in production; sessions live in D1, so banning a user or deleting their sessions takes effect on the next request (no cookie cache).
- **Two-factor authentication (TOTP + backup codes)** is available to everyone and **mandatory for administrators**: `requireAdmin()` and `route({ access: 'admin' })` both reject an admin without 2FA.
- **Brute-force protection**: Better Auth rate limits stored in D1 — sign-in 8 / 5 min, sign-up 6 / hour, password reset 4 / hour, 2FA 8 / 5 min per IP — plus Turnstile on sign-up, sign-in and password-reset requests. 2FA verification additionally locks after repeated failures.
- The forgot-password response is identical whether or not the account exists. Post-login redirects accept same-site relative paths only.

## Authorisation (`src/server/http.ts`)

- **Every** API route is wrapped in `route({ access })`: `public`, `user` or `admin`. There is no client-side-only protection anywhere.
- **RBAC**: `admin` requires `role = 'admin'` **and** 2FA. Admin pages call `requireAdmin()` in the layout and again in each page.
- **Ownership / IDOR**: mutations never trust an id alone. Queries include the owner in the `WHERE` clause (`... AND profile_id = <caller's profile>`, `... AND user_id = <caller>`), so another user's id matches nothing and returns 404.
- **Admin actions** go through one endpoint with a per-action Zod schema; each writes an `audit_logs` row with actor, target, metadata and IP. Admins cannot ban themselves or other admins from the dashboard. Promotion to admin is only possible with database access (`scripts/make-admin.mjs`).

## Subscription and limit enforcement

- Premium is computed on the server from `subscriptions` (`status = 'active' AND current_period_end > now`) on every request. Nothing in the browser can grant it.
- Project, photo and monthly quotation limits are enforced **atomically in SQL** (`INSERT … SELECT … WHERE count < limit`, conditional upsert), so parallel requests cannot slip past a limit.
- Premium-only features are refused server-side: cover upload (402), quotation history (402), logo on quotations (the logo URL is never sent to Free accounts).

## Payments (`src/server/paymongo.ts`, `src/server/billing.ts`, `src/app/api/webhooks/paymongo/route.ts`)

- Card and wallet details are entered on **PayMongo's hosted checkout**. Tibay never receives or stores them (keeps the app out of PCI scope beyond SAQ-A).
- **The price is never taken from the client**: the browser sends only `monthly` or `annual`.
- **Webhook authenticity**: `Paymongo-Signature` (`t=…,te=…,li=…`) is verified as HMAC-SHA256 of `"<t>.<raw body>"` with the webhook secret, in constant time, using the live or test signature according to the configured key.
- **Replay protection**: timestamps older or newer than 5 minutes are rejected; processed event ids are stored in `webhook_events`.
- **Server-side verification**: the webhook body is treated as a notification only. The checkout session is re-fetched from PayMongo's API with the secret key before anything is granted. The return-URL check does the same; a success URL alone activates nothing.
- **Idempotency**: checkout creation sends an `Idempotency-Key`; applying a payment is one D1 transaction guarded by the payment still being unclaimed, and `provider_payment_id` is unique — duplicate deliveries and races are no-ops.
- **Integrity checks before granting**: amount, currency (PHP) and live/test mode must equal what the server recorded. Mismatches are rejected and audited (`payment.rejected`).
- Test-mode events are ignored by a live deployment and vice versa.
- Every payment event writes an audit entry (`payment.checkout_started`, `payment.paid`, `payment.failed`, `payment.refunded`, `payment.rejected`, `webhook.signature_invalid`).
- The local payment simulator (`/dev/checkout`, `/api/dev/mock-pay`) returns 404 unless **no** PayMongo key is configured **and** `APP_ENV` is not `production`.

> **Assumption to confirm in PayMongo test mode before going live:** the signature format above follows PayMongo's published scheme, but the page documenting it could not be retrieved while building. `DEPLOYMENT.md` includes a step to verify one real test webhook end to end.

## Input handling

- **Validation**: every request body is parsed with Zod (`src/lib/validation.ts`, `src/lib/quotation.ts`), with length limits and a body-size cap.
- **SQL injection**: all queries use Drizzle with bound parameters. Raw SQL uses the `sql` template tag (parameterised). `LIKE` patterns escape `%`, `_` and `\`.
- **XSS**: user content is only ever rendered as React text (auto-escaped). No user HTML is accepted or rendered; the single `dangerouslySetInnerHTML` is server-built JSON-LD with `<` escaped. Social links must be `https://` on facebook.com / fb.com / m.me / messenger.com; `javascript:` and look-alike hosts are rejected. Email templates HTML-escape every value.
- **CSRF**: state-changing API requests must carry an `Origin` equal to the site (`assertSameOrigin`), on top of `SameSite=Lax` cookies. Better Auth enforces its own origin checks. The webhook and cron endpoints use a signature / shared secret instead of cookies.
- **CSV export** escapes quotes and prefixes formula-like cells (`= + - @`) to prevent spreadsheet injection.

## File uploads (`src/server/storage.ts`)

- Only JPEG, PNG and WebP, identified by **magic bytes** — the client's MIME type and filename are ignored, so SVG, HTML, GIF, PDF and executables are rejected.
- 1.5 MB hard cap, checked from `Content-Length` and again after reading.
- Object keys are generated by the server (`kind/userId/uuid.ext`); `/img` only serves keys matching that exact pattern, with a fixed allow-listed `Content-Type`, `X-Content-Type-Options: nosniff` and `Content-Security-Policy: default-src 'none'`.
- The R2 bucket is **private**: no public bucket URL exists; the Worker is the only reader. Nothing sensitive is stored in R2 — only public profile and portfolio images.
- Images are re-encoded in the browser before upload, which removes EXIF metadata (including GPS position).
- Upload endpoints are rate limited (60 / hour per user) and plan limits cap total storage per account.

## HTTP hardening (`next.config.ts`)

`Content-Security-Policy` (self-only, Turnstile allow-listed, no framing, no objects), `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Permissions-Policy`, `Strict-Transport-Security`, and no `X-Powered-By`.

Known limitation: `script-src` and `style-src` include `'unsafe-inline'` because Next.js inlines its hydration payload and the chart/dialog libraries set inline styles. A nonce-based CSP is a possible future hardening; the absence of any user-supplied HTML is the primary XSS defence.

## Rate limiting

| Scope | Limit |
|---|---|
| Sign-in / sign-up / reset / 2FA | See *Authentication* |
| Quotation request to a professional | 5 / hour per IP + Turnstile |
| Report a profile | 5 / hour per IP + Turnstile |
| Contact form | 3 / hour per IP + Turnstile |
| Uploads | 60 / hour per user |
| Profile / project / quotation writes | 60–120 / hour per user |
| Checkout creation | 10 / hour per user |
| Admin actions / exports | 300 / 30 per hour per admin |

Counters are stored in D1 (one atomic upsert), so they hold across Worker isolates. For volumetric attacks, enable Cloudflare's WAF rate-limiting rules on the zone as an outer layer.

## Secrets

- Secrets are **never** in the repository: `.dev.vars` (git-ignored) locally, `wrangler secret put` in production. `.env.example` lists every name with no values.
- `wrangler.jsonc` `vars` holds only non-secret configuration (site URL, sender address, Turnstile **site** key).
- Server modules import `server-only`, so a secret-bearing module cannot be bundled into client JavaScript.
- Required secrets: `BETTER_AUTH_SECRET`, `TURNSTILE_SECRET_KEY`, `RESEND_API_KEY`, `PAYMONGO_SECRET_KEY`, `PAYMONGO_WEBHOOK_SECRET`, `CRON_SECRET`.

## Audit logging

`audit_logs` is append-only from the application's point of view (no update or delete path exists). It records administrative actions, payment events, account deletion, exports, rejected webhooks and the daily job. Super Admins can search and export it.

## Backups and recovery

See `DEPLOYMENT.md` → *Backups and recovery* (D1 Time Travel, scheduled SQL exports, R2 considerations, restore drill).

## Philippine Data Privacy Act (RA 10173) considerations

Implemented in the product:
- **Consent and transparency**: explicit consent checkbox at registration linking to the Privacy Policy and Terms; the policy lists what is collected, why, processors and retention.
- **Data minimisation**: visitor quotation requests are emailed to the professional and **not stored**; the professional's contact email is never displayed; IP addresses are kept only in sessions, rate-limit counters and audit entries.
- **Data subject rights**: users can view and correct their data from their profile, hide their profile, and **delete their account** (profile, projects, photos, quotations and R2 images are erased; payment rows are retained for accounting with the user link removed).
- **Security measures**: the controls in this document, including admin 2FA and audit logs.

Operator responsibilities before launch (not solvable in code):
- Appoint a **Data Protection Officer** and, if the NPC's thresholds apply, register with the National Privacy Commission.
- Complete the Privacy Policy and Terms templates with the legal entity's name and address and have them reviewed by counsel.
- Sign or accept data-processing terms with Cloudflare, PayMongo and Resend (cross-border processing).
- Keep a breach-response procedure: qualifying breaches must be notified to the NPC and affected data subjects within 72 hours of knowledge.
- Professionals enter their own clients' details in quotations; the Terms place responsibility for a lawful basis on them — confirm this allocation with counsel.

## Not implemented (accepted risks / future work)

- Nonce-based CSP (see above).
- Passkeys / social login.
- Automated malware scanning of uploads (mitigated by strict image-only sniffing and serving headers).
- A separate append-only store for audit logs outside D1.
