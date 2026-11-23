# Database schema

Cloudflare D1 (SQLite). The Drizzle definition in `src/server/db/schema.ts` is the source; `migrations/` holds the generated SQL.

Conventions:
- Timestamps are integers (Unix **milliseconds**, UTC). Booleans are 0/1 integers.
- Money is integer **centavos**. Percentages are **basis points** (1% = 100).
- Primary keys are text (UUIDs, or Better Auth's ids for auth tables).
- Foreign keys cascade from `user` so deleting an account removes its data — except `payments`, which is kept (see below).

## Authentication (managed by Better Auth)

| Table | Purpose | Notable columns |
|---|---|---|
| `user` | Accounts | `email` (unique), `email_verified`, `role` (`user` \| `admin`), `banned`, `ban_reason`, `two_factor_enabled` |
| `session` | Login sessions | `token` (unique), `expires_at`, `ip_address`, `user_agent`, `user_id` → user |
| `account` | Credentials | `provider_id` = `credential`, `password` (scrypt hash) |
| `verification` | Email-verification and password-reset tokens | `identifier`, `value`, `expires_at` |
| `two_factor` | TOTP secrets and backup codes (encrypted by Better Auth) | `secret`, `backup_codes`, `user_id` |
| `rate_limit` | Rate-limit counters for auth endpoints and the app's own `rateLimit()` (keys prefixed `app:`) | `key` (unique), `count`, `last_request` |

## Profiles and portfolio

### `profiles` — one per user
`user_id` (unique → user), `username` (unique, the `/p/username` slug), `business_name`, `bio`, `services` (JSON string[]), `years_experience`, `province`, `city`, `service_areas` (JSON string[] of provinces), `phone`, `contact_email` (never shown publicly), `facebook_url`, `messenger_url`, `avatar_key`, `logo_key`, `cover_key` (R2 keys), `is_published` (owner-controlled), `status` (`active` \| `suspended`, admin-controlled).

Indexes: `(province, city)`, `(status, is_published, updated_at)` for directory listing.

### `profile_professions`, `profile_specializations`
Join tables `(profile_id, profession)` / `(profile_id, specialization)` with composite primary keys and an index on the tag column. They make multi-profession filtering an indexed `EXISTS` instead of scanning JSON.

### `projects`
`profile_id` → profiles, `title`, `description`, `location`, `year`. Index `(profile_id, created_at)`.

### `project_photos`
`project_id` → projects, `profile_id` → profiles (denormalised so the per-profile photo quota is one indexed count), `key` (unique R2 key), `size_bytes`, `sort_order`.

## Quotations

### `quotations`
`user_id` → user, `number` (`Q-YYYYMM-NNN`), `title`, `client_name`, `client_address`, `client_contact`, `issue_date`, `valid_until` (ISO dates), `items` (JSON array of `{type, description, quantity, unit, unitPrice}`), `discount_type` (`none` \| `percent` \| `fixed`), `discount_value`, `tax_rate_bps`, `payment_terms`, `notes`, and server-computed `subtotal`, `discount_amount`, `tax_amount`, `total`. Index `(user_id, created_at)`.

### `usage_counters`
Primary key `(user_id, period, kind)`; `period` is `YYYY-MM` in Asia/Manila; `kind` is `quotation`. Incremented with a conditional upsert that only succeeds below the plan limit.

## Billing

### `subscriptions` — at most one row per user
`user_id` (unique), `interval` (`monthly` \| `annual`), `status` (`active` \| `expired` \| `revoked`), `price_amount` (what was paid for the current period; 0 for complimentary grants — the basis for MRR/ARR), `current_period_start`, `current_period_end`, `cancel_at_period_end`, `reminder_sent_at`. Index `(status, current_period_end)`.

### `payments` — one row per checkout attempt
`user_id` (**nullable, `ON DELETE SET NULL`** — payment records are retained for accounting after an account is deleted, detached from the person), `interval`, `status` (`pending` \| `paid` \| `failed` \| `expired` \| `refunded`), `amount` (fixed by the server at checkout), `fee`, `net_amount`, `refunded_amount`, `checkout_session_id` (unique), `provider_payment_id` (unique — a PayMongo payment can be applied only once), `payment_method`, `livemode`, `period_start`, `period_end`, `paid_at`, `failure_reason`. Indexes `(user_id, created_at)`, `(status, paid_at)`.

### `webhook_events`
`id` = PayMongo event id (primary key), `type`, `received_at`. Processed-event ledger for replay protection; pruned after 60 days.

## Moderation, audit, settings

| Table | Purpose |
|---|---|
| `reports` | Visitor reports against a profile: `reason`, `details`, `reporter_email`, `status` (`open` \| `resolved` \| `dismissed`), `resolved_by`, `resolved_at`. |
| `audit_logs` | Append-only trail: `actor_id`, `actor_type` (`admin` \| `user` \| `system`), `action` (e.g. `admin.user.ban`, `payment.paid`, `webhook.signature_invalid`), `target_type`, `target_id`, `metadata` (JSON), `ip`. |
| `settings` | Key/value JSON: `plans` (pricing + limits override), `r2_cleanup_cursor`. |

## Entity relationships

```
user 1─1 profiles 1─* projects 1─* project_photos
  │        ├─* profile_professions
  │        ├─* profile_specializations
  │        └─* reports
  ├─* quotations
  ├─* usage_counters
  ├─1 subscriptions
  ├─* payments            (user_id nullable)
  └─* session / account / two_factor
```

## Migrations

```bash
pnpm db:generate          # after editing src/server/db/schema.ts → new SQL file in migrations/
pnpm db:migrate:local     # apply to the local D1 used by `pnpm dev`
pnpm db:migrate:remote    # apply to production D1 (run deliberately; see DEPLOYMENT.md)
```

Review generated SQL before applying it remotely. D1 has no down-migrations: take an export first (`DEPLOYMENT.md` → Backups).
