import 'server-only';
import { cache } from 'react';
import { eq, sql } from 'drizzle-orm';
import { DEFAULT_PLAN_CONFIG, planConfigSchema, type PlanConfig, type PlanId, type PlanLimits } from '@/lib/plans';
import { getDb, schema } from './db';

export const PLAN_SETTINGS_KEY = 'plans';

async function loadPlanConfig(): Promise<PlanConfig> {
  const row = await getDb().select().from(schema.settings).where(eq(schema.settings.key, PLAN_SETTINGS_KEY)).get();
  const parsed = row ? planConfigSchema.safeParse(row.value) : null;
  return parsed?.success ? parsed.data : DEFAULT_PLAN_CONFIG;
}
export const getPlanConfig = cache(loadPlanConfig);

export type SubscriptionRow = typeof schema.subscriptions.$inferSelect;

/** Premium is derived from the paid period, never from a flag: an unpaid/expired period is Free immediately. */
export function isSubscriptionActive(sub: Pick<SubscriptionRow, 'status' | 'currentPeriodEnd'> | null | undefined, now = Date.now()) {
  return !!sub && sub.status === 'active' && sub.currentPeriodEnd.getTime() > now;
}

export type Entitlements = { plan: PlanId; limits: PlanLimits; subscription: SubscriptionRow | null };

export async function getEntitlements(userId: string): Promise<Entitlements> {
  const [config, subscription] = await Promise.all([
    getPlanConfig(),
    getDb().select().from(schema.subscriptions).where(eq(schema.subscriptions.userId, userId)).get(),
  ]);
  const plan: PlanId = isSubscriptionActive(subscription) ? 'premium' : 'free';
  return { plan, limits: config.limits[plan], subscription: subscription ?? null };
}

/** Current usage period (YYYY-MM) in Philippine time. */
export function currentPeriod(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit' }).format(now).slice(0, 7);
}

/**
 * SQL boolean (0/1): the given user currently has paid Premium. Mirrors isSubscriptionActive (status + period end),
 * evaluated at query time so a lapsed plan stops ranking immediately.
 */
export function premiumSql(table: 'profiles' | 'user', column: 'user_id' | 'id' = table === 'user' ? 'id' : 'user_id') {
  // Always table-qualified: in a single-table select Drizzle renders columns unqualified, and an unqualified
  // "user_id" inside this subquery would bind to subscriptions.user_id and make every row look Premium.
  const ref = sql.raw(`"${table}"."${column}"`);
  return sql<number>`EXISTS (SELECT 1 FROM subscriptions s WHERE s.user_id = ${ref} AND s.status = 'active' AND s.current_period_end > ${Date.now()})`;
}

/** Current usage day (YYYY-MM-DD) in Philippine time, for daily quotas. */
export function currentDay(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

export type QuotaKind = 'quotation' | 'post' | 'comment';

/**
 * Atomically consumes one unit of a usage counter. Returns the new count, or null when the limit is reached.
 * The upsert only increments while count < limit, so concurrent requests can never exceed the plan.
 */
export async function consumeQuota(userId: string, kind: QuotaKind, period: string, limit: number | null): Promise<number | null> {
  if (limit !== null && limit <= 0) return null;
  const guard = limit === null ? sql`` : sql` WHERE count < ${limit}`;
  const rows = await getDb().all<{ count: number }>(sql`
    INSERT INTO usage_counters (user_id, period, kind, count) VALUES (${userId}, ${period}, ${kind}, 1)
    ON CONFLICT(user_id, period, kind) DO UPDATE SET count = count + 1${guard}
    RETURNING count`);
  return rows[0]?.count ?? null;
}

/** Gives one unit back (used when the guarded write that followed the reservation failed). */
export async function refundQuota(userId: string, kind: QuotaKind, period: string) {
  await getDb().run(sql`UPDATE usage_counters SET count = count - 1 WHERE user_id = ${userId} AND period = ${period} AND kind = ${kind} AND count > 0`);
}
