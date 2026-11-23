import 'server-only';
import { sql } from 'drizzle-orm';
import { getDb } from '../db';

/** Asia/Manila is UTC+8 with no DST; bucketing adds 8h before truncating to a day/month. */
const MANILA_OFFSET_MS = 8 * 3600_000;
const DAY = 86_400_000;

export type DateRange = { from: Date; to: Date };

/** Parses ?from=YYYY-MM-DD&to=YYYY-MM-DD (Manila dates, inclusive). Defaults to the last 30 days. */
export function parseRange(from?: string, to?: string): DateRange & { fromInput: string; toInput: string } {
  const iso = /^\d{4}-\d{2}-\d{2}$/;
  const today = new Date(Date.now() + MANILA_OFFSET_MS).toISOString().slice(0, 10);
  let toInput = to && iso.test(to) ? to : today;
  let fromInput = from && iso.test(from) ? from : new Date(Date.parse(toInput) - 29 * DAY).toISOString().slice(0, 10);
  if (fromInput > toInput) [fromInput, toInput] = [toInput, fromInput];
  // Cap at 2 years to bound query cost.
  if (Date.parse(toInput) - Date.parse(fromInput) > 731 * DAY) fromInput = new Date(Date.parse(toInput) - 731 * DAY).toISOString().slice(0, 10);
  return { from: new Date(Date.parse(fromInput) - MANILA_OFFSET_MS), to: new Date(Date.parse(toInput) + DAY - MANILA_OFFSET_MS), fromInput, toInput };
}

export function monthStart(now = new Date()) {
  const manila = new Date(now.getTime() + MANILA_OFFSET_MS);
  return new Date(Date.UTC(manila.getUTCFullYear(), manila.getUTCMonth(), 1) - MANILA_OFFSET_MS);
}

/**
 * Recurring revenue from a set of active subscriptions.
 * MRR normalises annual plans to a monthly amount (price / 12); ARR = MRR × 12.
 * Complimentary (₱0) grants contribute nothing. This is a run-rate metric, NOT cash collected.
 */
export function recurringRevenue(active: { interval: 'monthly' | 'annual'; priceAmount: number }[]) {
  const mrr = active.reduce((sum, s) => sum + (s.interval === 'annual' ? Math.round(s.priceAmount / 12) : s.priceAmount), 0);
  return { mrr, arr: mrr * 12 };
}

export function rate(numerator: number, denominator: number) {
  return denominator > 0 ? numerator / denominator : 0;
}

export async function getOverview(range: DateRange) {
  const db = getDb();
  const now = Date.now();
  const from = range.from.getTime();
  const to = range.to.getTime();
  const month = monthStart().getTime();
  const churnWindow = now - 30 * DAY;

  const [users, subs, activeSubs, money, failed] = await Promise.all([
    db.get<{ total: number; inRange: number; banned: number }>(sql`
      SELECT COUNT(*) AS total,
             COALESCE(SUM(created_at >= ${from} AND created_at < ${to}), 0) AS inRange,
             COALESCE(SUM(banned = 1), 0) AS banned
      FROM user`),
    db.get<{ active: number; expired: number; revoked: number; churned: number; upcoming: number }>(sql`
      SELECT COALESCE(SUM(status = 'active' AND current_period_end > ${now}), 0) AS active,
             COALESCE(SUM(status = 'expired' OR (status = 'active' AND current_period_end <= ${now})), 0) AS expired,
             COALESCE(SUM(status = 'revoked'), 0) AS revoked,
             COALESCE(SUM(status != 'active' AND current_period_end >= ${churnWindow} AND current_period_end <= ${now}), 0) AS churned,
             COALESCE(SUM(status = 'active' AND current_period_end > ${now} AND current_period_end <= ${now + 14 * DAY}), 0) AS upcoming
      FROM subscriptions`),
    db.all<{ interval: 'monthly' | 'annual'; priceAmount: number }>(sql`
      SELECT interval, price_amount AS priceAmount FROM subscriptions WHERE status = 'active' AND current_period_end > ${now}`),
    db.get<{ lifetime: number; lifetimeFees: number; lifetimeRefunds: number; month: number; monthFees: number; monthRefunds: number; ranged: number; rangedFees: number; rangedRefunds: number }>(sql`
      SELECT COALESCE(SUM(amount), 0) AS lifetime, COALESCE(SUM(fee), 0) AS lifetimeFees, COALESCE(SUM(refunded_amount), 0) AS lifetimeRefunds,
             COALESCE(SUM(CASE WHEN paid_at >= ${month} THEN amount END), 0) AS month,
             COALESCE(SUM(CASE WHEN paid_at >= ${month} THEN fee END), 0) AS monthFees,
             COALESCE(SUM(CASE WHEN paid_at >= ${month} THEN refunded_amount END), 0) AS monthRefunds,
             COALESCE(SUM(CASE WHEN paid_at >= ${from} AND paid_at < ${to} THEN amount END), 0) AS ranged,
             COALESCE(SUM(CASE WHEN paid_at >= ${from} AND paid_at < ${to} THEN fee END), 0) AS rangedFees,
             COALESCE(SUM(CASE WHEN paid_at >= ${from} AND paid_at < ${to} THEN refunded_amount END), 0) AS rangedRefunds
      FROM payments WHERE paid_at IS NOT NULL AND status IN ('paid', 'refunded')`),
    db.get<{ count: number }>(sql`SELECT COUNT(*) AS count FROM payments WHERE status = 'failed' AND created_at >= ${from} AND created_at < ${to}`),
  ]);

  const totalUsers = users?.total ?? 0;
  const active = subs?.active ?? 0;
  const churned = subs?.churned ?? 0;
  const collections = {
    lifetime: money?.lifetime ?? 0,
    month: money?.month ?? 0,
    range: money?.ranged ?? 0,
    fees: money?.rangedFees ?? 0,
    refunds: money?.rangedRefunds ?? 0,
    lifetimeFees: money?.lifetimeFees ?? 0,
    lifetimeRefunds: money?.lifetimeRefunds ?? 0,
    /** Cash actually kept in the selected range: collected − gateway fees − refunds. */
    net: (money?.ranged ?? 0) - (money?.rangedFees ?? 0) - (money?.rangedRefunds ?? 0),
    lifetimeNet: (money?.lifetime ?? 0) - (money?.lifetimeFees ?? 0) - (money?.lifetimeRefunds ?? 0),
  };

  return {
    users: { total: totalUsers, newInRange: users?.inRange ?? 0, banned: users?.banned ?? 0, premium: active, free: Math.max(0, totalUsers - active) },
    subscriptions: { active, expired: subs?.expired ?? 0, revoked: subs?.revoked ?? 0, upcomingRenewals: subs?.upcoming ?? 0 },
    recurring: recurringRevenue(activeSubs),
    collections,
    failedPayments: failed?.count ?? 0,
    /** Share of all registered users currently on Premium. */
    conversionRate: rate(active, totalUsers),
    /** Subscriptions that lapsed in the last 30 days ÷ subscriptions that were active at the start of that window. */
    churnRate: rate(churned, active + churned),
  };
}

export async function getAnalytics(range: DateRange) {
  const db = getDb();
  const from = range.from.getTime();
  const to = range.to.getTime();
  const now = Date.now();
  // Daily buckets for short ranges, monthly for long ones.
  const monthly = to - from > 92 * DAY;
  const bucket = (column: string) => sql.raw(`strftime('${monthly ? '%Y-%m' : '%Y-%m-%d'}', (${column} + ${MANILA_OFFSET_MS}) / 1000, 'unixepoch')`);

  const [revenue, registrations, intervals, professions, provinces] = await Promise.all([
    db.all<{ bucket: string; gross: number; net: number }>(sql`
      SELECT ${bucket('paid_at')} AS bucket, SUM(amount) AS gross, SUM(amount - fee - refunded_amount) AS net
      FROM payments WHERE paid_at >= ${from} AND paid_at < ${to} AND status IN ('paid', 'refunded') GROUP BY 1 ORDER BY 1`),
    db.all<{ bucket: string; count: number }>(sql`
      SELECT ${bucket('created_at')} AS bucket, COUNT(*) AS count FROM user WHERE created_at >= ${from} AND created_at < ${to} GROUP BY 1 ORDER BY 1`),
    db.all<{ interval: string; count: number }>(sql`
      SELECT interval, COUNT(*) AS count FROM subscriptions WHERE status = 'active' AND current_period_end > ${now} GROUP BY interval`),
    db.all<{ name: string; count: number }>(sql`
      SELECT profession AS name, COUNT(*) AS count FROM profile_professions GROUP BY profession ORDER BY count DESC LIMIT 10`),
    db.all<{ name: string; count: number }>(sql`
      SELECT province AS name, COUNT(*) AS count FROM profiles WHERE province != '' GROUP BY province ORDER BY count DESC LIMIT 10`),
  ]);

  return { granularity: monthly ? ('month' as const) : ('day' as const), revenue, registrations, intervals, professions, provinces };
}
