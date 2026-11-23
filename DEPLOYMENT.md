# Deployment

> **Nothing has been deployed.** Production deployment and live payments require the owner's explicit approval. Follow these steps in order; steps marked **(approval)** are the points of no return.

## What you need

| Service | Plan | Used for |
|---|---|---|
| Cloudflare | Free (see *Costs*) | Workers, D1, R2, Turnstile, DNS |
| A domain on Cloudflare | — | Custom domain, HTTPS, email sender domain |
| PayMongo | Standard merchant account | Payments (fees per transaction) |
| Resend | Free (100 emails/day, 3,000/month at the time of writing) | Transactional email |

## 1. Create Cloudflare resources

```bash
pnpm exec wrangler login
pnpm exec wrangler d1 create tibay              # copy the database_id it prints
pnpm exec wrangler r2 bucket create tibay-media
```

Put the `database_id` into `wrangler.jsonc` (`d1_databases[0].database_id`). Keep the R2 bucket **private** — do not enable public access or an r2.dev URL; images are served through the Worker.

Create a **Turnstile** widget (Cloudflare dashboard → Turnstile) for your domain and note the site key and secret key.

## 2. Production configuration

Edit `wrangler.jsonc` → `vars` (non-secret values only):

```jsonc
"vars": {
  "APP_ENV": "production",
  "PUBLIC_SITE_URL": "https://your-domain.ph",
  "SUPPORT_EMAIL": "support@your-domain.ph",
  "EMAIL_FROM": "Tibay <no-reply@your-domain.ph>",
  "TURNSTILE_SITE_KEY": "<your real site key>"
}
```

Tip: to keep local development unchanged, put production values in a Wrangler environment (`"env": { "production": { "vars": { … }, "d1_databases": [ … ], "r2_buckets": [ … ] } }`) and deploy with `--env production`.

Set secrets (each command prompts for the value; nothing is written to disk):

```bash
pnpm exec wrangler secret put BETTER_AUTH_SECRET        # openssl rand -base64 32
pnpm exec wrangler secret put CRON_SECRET               # openssl rand -hex 32
pnpm exec wrangler secret put TURNSTILE_SECRET_KEY
pnpm exec wrangler secret put RESEND_API_KEY
pnpm exec wrangler secret put PAYMONGO_SECRET_KEY       # sk_test_… first; sk_live_… only at go-live
pnpm exec wrangler secret put PAYMONGO_WEBHOOK_SECRET   # from step 6
# Optional integrations
pnpm exec wrangler secret put GOOGLE_CLIENT_ID          # enables "Continue with Google"
pnpm exec wrangler secret put GOOGLE_CLIENT_SECRET
pnpm exec wrangler secret put ALERT_WEBHOOK_URL         # Slack / Discord / Google Chat incoming webhook for failure alerts
```

### Google sign-in

In Google Cloud Console → APIs & Services → Credentials → your OAuth 2.0 Client (type *Web application*):

- **Authorised JavaScript origins:** `http://localhost:3000` and `https://your-domain.ph`
- **Authorised redirect URIs:** `http://localhost:3000/api/auth/callback/google` and `https://your-domain.ph/api/auth/callback/google`

The redirect URI must be the full callback path — the site root alone is rejected by Google with `redirect_uri_mismatch`. On the OAuth consent screen, add the scopes `email` and `profile` and publish the app (or add test users while it is in testing). Never commit the downloaded `client_secret_….json`; it is git-ignored and can be deleted once the two values are stored as secrets. Facebook works the same way with `FACEBOOK_CLIENT_ID` / `FACEBOOK_CLIENT_SECRET` and the callback `/api/auth/callback/facebook`.

Administrator accounts cannot be linked to Google or Facebook and must sign in with password + two-factor.

### Failure alerts

Tibay notifies you when emails fail, checkout cannot start, payments fail or are rejected, webhooks are invalid or error, the daily job fails, or an unexpected server error occurs — at most once per hour per problem. Alerts go to `ALERT_EMAIL` (a `vars` entry; defaults to `SUPPORT_EMAIL`) and, if set, to `ALERT_WEBHOOK_URL`. Configure the webhook: it is the only channel that still works when email itself is down. Use *Send test alert* on `/admin/system` after deploying.

`APP_ENV=production` matters: it turns on secure cookies, disables the payment simulator and makes missing email configuration an error instead of a console log.

## 3. Email (Resend)

Add and verify your sending domain in Resend (SPF and DKIM records in Cloudflare DNS). `EMAIL_FROM` must use that domain. Without a verified domain, verification and reset emails will not be delivered and nobody can register.

## 4. Database migration **(approval)**

```bash
pnpm db:migrate:remote
```

Never run `pnpm db:seed` against production — the script is hard-wired to `--local` and refuses `--remote`.

## 5. Deploy **(approval)**

```bash
pnpm deploy          # opennextjs-cloudflare build && deploy
```

Then in the Cloudflare dashboard: Workers → `tibay` → Settings → Domains & Routes → add your custom domain. Confirm the Cron Trigger (`15 18 * * *`, 02:15 Manila) is listed under Triggers.

Create the first Super Admin: register normally on the live site, verify the email, then:

```bash
pnpm admin:promote you@your-domain.ph --remote
```

Sign in, open *Account settings*, enable two-factor authentication and store the backup codes. `/admin` opens only after that.

## 6. PayMongo webhook

Register the webhook once per environment (test and live have separate keys and separate webhooks):

```bash
curl -X POST https://api.paymongo.com/v1/webhooks \
  -u "sk_test_xxx:" -H "content-type: application/json" \
  -d '{"data":{"attributes":{"url":"https://your-domain.ph/api/webhooks/paymongo","events":["checkout_session.payment.paid","payment.failed","payment.refunded"]}}}'
```

The response contains `secret_key` (`whsk_…`). Store it with `wrangler secret put PAYMONGO_WEBHOOK_SECRET`.

## 7. Test-mode payment rehearsal (required before live)

With `sk_test_…` keys deployed:

1. Upgrade a test account from *Subscription* and pay with a PayMongo test card / test e-wallet.
2. Confirm the account becomes Premium and the payment appears in `/admin/transactions` with fee and net amounts.
3. `/admin/audit` must show `payment.paid` and **no** `webhook.signature_invalid`. If signature failures appear, the header format differs from the assumption documented in `SECURITY.md`: compare a captured `Paymongo-Signature` header with `verifyWebhookSignature()` in `src/server/paymongo.ts` and adjust before going further.
4. Check which `payment_method_types` your PayMongo account has enabled; remove any that are not from `createCheckoutSession()` in `src/server/paymongo.ts` (a disabled method makes checkout creation fail).
5. Refund the test payment from the PayMongo dashboard and confirm Premium is revoked and the refund appears in the admin overview.
6. `/admin/system` should show every check as OK, including a recent *Daily maintenance* run after the first night, and *Problems and alerts* should read "All clear".

## 8. Go live **(approval)**

1. Replace `PAYMONGO_SECRET_KEY` with the `sk_live_…` key.
2. Register the webhook again with the live key (step 6) and update `PAYMONGO_WEBHOOK_SECRET`.
3. Make one small real purchase and refund it.

## Costs and free-tier limits

Figures below are Cloudflare's published free allowances at the time of writing — confirm current numbers in the dashboard.

| Resource | Free allowance | What uses it |
|---|---|---|
| Workers requests | 100,000 / day | Every page view, API call and `/img` request (static JS/CSS are free) |
| Workers CPU time | 10 ms / request | See the note below |
| Worker size | 3 MiB gzipped | Currently 2.34 MiB |
| D1 | 5 GB, 5 M rows read / day, 100 k rows written / day | All data, sessions, rate limits |
| R2 | 10 GB, 1 M writes and 10 M reads / month | Images (≈ 200–350 KB each after compression) |
| Resend | 100 emails / day | Verification, resets, inquiries, reminders |

**CPU-time note (the one likely reason to pay):** password hashing (scrypt) is deliberately expensive and can exceed the free plan's 10 ms CPU limit on sign-up, sign-in and password change. Cloudflare may terminate such requests on the free plan under load. If sign-ins fail with "exceeded CPU" errors in the Worker logs, move to **Workers Paid (US$5 / month)**, which raises the limit to 30 s and the bundle limit to 10 MiB. Do not weaken the hash to fit the free plan.

Rough capacity on free tiers: a full Premium portfolio is up to 500 photos (50 projects × 10), roughly 150 MB, so 10 GB holds about 65 completely full Premium accounts — in practice far more, since few fill every slot. A Free account tops out near 1.5 MB. Several thousand page views a day fit in the request allowance. The first limit most sites hit is the 100,000 requests/day; putting `/img` behind an R2 custom domain with Cloudflare caching is the natural next optimisation.

`/admin/system` shows database size and tracked photo storage against these limits.

## Backups and recovery

**D1**
- *Time Travel* is built in: point-in-time restore to any minute in the retention window (30 days on paid, 7 days on free at the time of writing).
  ```bash
  pnpm exec wrangler d1 time-travel info tibay
  pnpm exec wrangler d1 time-travel restore tibay --timestamp=2026-11-23T02:00:00Z
  ```
- Take an off-platform export on a schedule (weekly is reasonable) and before every migration:
  ```bash
  pnpm exec wrangler d1 export tibay --remote --output=backup-$(date +%F).sql
  ```
  Store exports encrypted, outside Cloudflare. They contain personal data and password hashes.

**R2** has no automatic backup. Images are user-replaceable content; if that risk is not acceptable, mirror the bucket periodically (e.g. `rclone sync`) to another bucket or provider.

**Restore drill** (do once before launch): export production → `wrangler d1 execute tibay --local --file=backup.sql` into an empty local database → run `pnpm dev` and confirm you can sign in and see profiles.

**Rollback of a bad deploy:** `pnpm exec wrangler rollback` returns to the previous Worker version. Schema changes are not rolled back by this — keep migrations backward compatible (add columns first, remove later).

## Operations

- **Logs:** Workers → `tibay` → Logs (observability is enabled in `wrangler.jsonc`). Search for `[api]`, `[billing]`, `[webhook]`, `[email]`, `[maintenance]`.
- **Changing prices or limits:** `/admin/settings` — no deploy needed.
- **Refunds:** issue in the PayMongo dashboard; Tibay updates itself from the webhook.
- **Manual / offline payment:** `/admin/users` → *Grant 30 days / 1 year Premium* (recorded in the audit log, counted as ₱0 in MRR).
- **Rotating secrets:** `wrangler secret put <NAME>` again. Rotating `BETTER_AUTH_SECRET` signs everyone out and invalidates existing 2FA enrolments.
- **CI:** `.github/workflows/ci.yml` builds and tests only. There is intentionally no automatic deploy job.
