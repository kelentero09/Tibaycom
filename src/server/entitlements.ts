import 'server-only';
import { cache } from 'react';
import { eq } from 'drizzle-orm';
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
