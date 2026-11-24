import 'server-only';
import { sql } from 'drizzle-orm';
import { getDb, getEnv, optionalEnv } from './db';

/** What can go wrong in production that the owner must hear about. */
export type AlertKind = 'email' | 'payment_checkout' | 'payment_failed' | 'payment_rejected' | 'payment_refund_unknown' | 'webhook_signature' | 'webhook_error' | 'api_error' | 'maintenance' | 'test';

export const ALERT_LABELS: Record<AlertKind, string> = {
  email: 'Emails are failing to send',
  payment_checkout: 'Checkout could not be started with PayMongo',
  payment_failed: 'Customer payments are failing',
  payment_rejected: 'A payment was rejected by integrity checks',
  payment_refund_unknown: 'A refund event arrived without refund amounts',
  webhook_signature: 'Webhook deliveries with invalid signatures',
  webhook_error: 'Webhook processing errors',
  api_error: 'Unexpected server errors',
  maintenance: 'Daily maintenance job failed',
  test: 'Test alert',
};

/** At most one notification per kind per hour; occurrences in between are counted and reported in the next one. */
const THROTTLE_MS = 60 * 60 * 1000;

async function deliver(kind: AlertKind, message: string, occurrences: number) {
  const env = getEnv();
  const title = `[Tibay] ${ALERT_LABELS[kind]}`;
  const body = `${message}\n\nOccurrences since the last alert: ${occurrences}\nEnvironment: ${env.APP_ENV}\nDetails: ${env.PUBLIC_SITE_URL}/admin/system`;
  const tasks: Promise<unknown>[] = [];

  // Chat webhook (Slack, Discord, Google Chat and most others accept one of these two fields).
  const webhook = optionalEnv('ALERT_WEBHOOK_URL');
  if (webhook?.startsWith('https://'))
    tasks.push(fetch(webhook, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text: `${title}\n${body}`, content: `${title}\n${body}`.slice(0, 1900) }) }));

  // Email — pointless when email itself is what is broken.
  if (kind !== 'email') {
    const { sendEmail } = await import('./email');
    tasks.push(sendEmail({ to: optionalEnv('ALERT_EMAIL') || env.SUPPORT_EMAIL, subject: title, heading: ALERT_LABELS[kind], paragraphs: body.split('\n\n'), action: { label: 'Open system health', url: `${env.PUBLIC_SITE_URL}/admin/system` } }, { alertOnFailure: false }));
  }
  const results = await Promise.allSettled(tasks);
  results.forEach((r) => r.status === 'rejected' && console.error('[alerts] delivery failed', r.reason));
}

/**
 * Records an operational problem and notifies the owner (throttled). Never throws:
 * alerting must not turn a handled failure into an unhandled one.
 */
export async function reportProblem(kind: AlertKind, message: string) {
  console.error(`[alert:${kind}] ${message}`);
  try {
    const db = getDb();
    const now = Date.now();
    const text = message.slice(0, 500);
    const recorded = await db.all<{ pending: number }>(sql`
      INSERT INTO alerts (kind, last_message, count, pending_count, first_seen_at, last_seen_at) VALUES (${kind}, ${text}, 1, 1, ${now}, ${now})
      ON CONFLICT(kind) DO UPDATE SET last_message = ${text}, count = count + 1, pending_count = pending_count + 1, last_seen_at = ${now}
      RETURNING pending_count AS pending`);
    // Atomic claim so a burst of simultaneous failures sends exactly one notification.
    const claimed = await db.all<{ kind: string }>(sql`
      UPDATE alerts SET last_notified_at = ${now}, pending_count = 0
      WHERE kind = ${kind} AND (last_notified_at IS NULL OR last_notified_at < ${now - THROTTLE_MS})
      RETURNING kind`);
    if (claimed.length) await deliver(kind, text, Math.max(1, recorded[0]?.pending ?? 1));
  } catch (error) {
    console.error('[alerts] could not record problem', kind, error);
  }
}

export async function listAlerts() {
  return getDb().all<{ kind: AlertKind; lastMessage: string; count: number; firstSeenAt: number; lastSeenAt: number; lastNotifiedAt: number | null }>(sql`
    SELECT kind, last_message AS lastMessage, count, first_seen_at AS firstSeenAt, last_seen_at AS lastSeenAt, last_notified_at AS lastNotifiedAt
    FROM alerts ORDER BY last_seen_at DESC`);
}

export const alertChannels = () => ({ webhook: !!optionalEnv('ALERT_WEBHOOK_URL'), email: optionalEnv('ALERT_EMAIL') || getEnv().SUPPORT_EMAIL });
