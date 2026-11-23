/**
 * Secrets the Worker expects. `pnpm cf-typegen` derives binding types from wrangler.jsonc and from a local
 * `.dev.vars` file — which does not exist in CI — so the required secrets are declared here explicitly.
 * Optional integrations (GOOGLE_CLIENT_ID/SECRET, FACEBOOK_CLIENT_ID/SECRET, ALERT_WEBHOOK_URL, ALERT_EMAIL)
 * are read with `optionalEnv()` and intentionally not listed.
 */
interface CloudflareEnv {
  BETTER_AUTH_SECRET: string;
  TURNSTILE_SECRET_KEY: string;
  RESEND_API_KEY: string;
  PAYMONGO_SECRET_KEY: string;
  PAYMONGO_WEBHOOK_SECRET: string;
  CRON_SECRET: string;
}
