# Tibay

A lightweight, mobile-first SaaS for the Philippine construction industry. Contractors, architects, engineers and skilled workers get a public profile with a project portfolio, a quotation maker with PDF export, and a place in a searchable directory. Clients browse and contact professionals without registering.

- **Free:** profile, directory listing, QR code, requests inbox, 2 projects, 2 photos per project, 2 quotations a month
- **Premium (₱399 / month or ₱3,990 / year — saves ₱798):** 50 projects, 10 photos per project, unlimited quotations, branded quotations, quotation history, custom cover photo, no platform branding

Also included: sign-in with Google (and Facebook when configured), English / Filipino interface, shareable quotation links, and owner alerts when emails or payments fail. Prices and limits are editable in `/admin/settings`.

Built to run on Cloudflare's free tier: one Worker, one D1 database, one R2 bucket.

## Documentation

| File | Contents |
|---|---|
| [PROJECT_PLAN.md](PROJECT_PLAN.md) | Scope, what was built, assumptions, limitations, open items |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Stack, folder structure, request flow, design decisions |
| [DATABASE_SCHEMA.md](DATABASE_SCHEMA.md) | Tables, indexes, relationships, migrations |
| [SECURITY.md](SECURITY.md) | Controls, payment security, Data Privacy Act notes |
| [TESTING.md](TESTING.md) | Test suites, what they cover, how to run them |
| [DEPLOYMENT.md](DEPLOYMENT.md) | Cloudflare setup, secrets, PayMongo, backups, go-live checklist |

## Requirements

- Node.js 22 or newer
- pnpm 11 (`corepack enable` or `npm i -g pnpm`)
- No Cloudflare account is needed for local development — D1 and R2 are emulated locally.

## Quick start

```bash
pnpm install
cp .env.example .dev.vars        # then set BETTER_AUTH_SECRET and CRON_SECRET (see comments in the file)
pnpm cf-typegen                  # generate binding types
pnpm db:migrate:local            # create the local database
pnpm db:seed                     # optional: demo data (development only)
pnpm dev                         # http://localhost:3000
```

Seeded accounts (password `tibay-dev-password`):

| Email | What it is |
|---|---|
| `free@tibay.test` | Free plan professional — `/p/jdc-builders` |
| `premium@tibay.test` | Premium professional — `/p/santos-architects` |
| `expired@tibay.test` | Lapsed Premium (downgraded to Free) |
| `admin@tibay.test` | Super Admin. Set up two-factor authentication in *Account settings* first; `/admin` stays closed until you do. |

Local behaviour without external keys:

- **Emails** (verification, password reset, reminders) are printed to the terminal — copy the link from there.
- **Turnstile** uses Cloudflare's always-pass test keys.
- **Payments** go to a built-in simulator page instead of PayMongo (only when no PayMongo key is set and `APP_ENV` is not `production`). Add PayMongo **test** keys to `.dev.vars` to use the real hosted checkout.
- **Google sign-in** appears when `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are in `.dev.vars`. In Google Cloud Console the OAuth client needs the redirect URI `http://localhost:3000/api/auth/callback/google` (see DEPLOYMENT.md).
- After changing `.dev.vars`, restart `pnpm dev`.

## Commands

| Command | Purpose |
|---|---|
| `pnpm dev` | Next.js dev server with local D1/R2 |
| `pnpm build` | Next.js production build (webpack) |
| `pnpm build:worker` | Build the Cloudflare Worker bundle (`.open-next/`) |
| `pnpm preview` | Build and run the Worker locally in the Workers runtime |
| `pnpm lint` / `pnpm typecheck` / `pnpm format` | Code quality |
| `pnpm test` | Unit + integration tests |
| `pnpm e2e:prepare` | Create an isolated test database + secrets file (never touches your dev data) |
| `pnpm e2e:serve` | Run the built Worker on that isolated environment (port 8787) |
| `pnpm test:e2e` | Playwright against the built Worker (run `pnpm build:worker` and `pnpm e2e:prepare` first) |
| `node scripts/smoke.mjs` / `node scripts/smoke-admin.mjs` | HTTP smoke tests against `pnpm e2e:serve` |
| `pnpm db:generate` | Create a migration after editing the schema |
| `pnpm db:migrate:local` / `pnpm db:migrate:remote` | Apply migrations |
| `pnpm db:seed` | **Replace everything** in your local dev database with demo data |
| `pnpm admin:promote <email> [--remote]` | Make an existing verified account a Super Admin |
| `node scripts/analyze-bundle.mjs` | Show what is in the Worker bundle |
| `node scripts/fetch-psgc.mjs` | Refresh the province / city list from the PSGC |
| `pnpm deploy` | Build and deploy to Cloudflare — **see DEPLOYMENT.md first** |

## Project status

All modules in the specification are implemented and verified locally (lint, typecheck, 141 unit/integration tests, 20 browser tests, and smoke tests against the built Worker). Nothing has been deployed and no live payment keys are configured. Read the *Before going live* list in [PROJECT_PLAN.md](PROJECT_PLAN.md).

## Windows notes

- `pnpm-workspace.yaml` sets `nodeLinker: hoisted` so the Worker build works without Windows Developer Mode (the build cannot create symlinks otherwise).
- If a build or `pnpm install` fails with "resource busy" or "permission denied", a previous `pnpm dev` / `wrangler dev` left `node.exe` or `workerd.exe` running. End those processes and retry.
