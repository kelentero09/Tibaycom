import 'server-only';
import { and, desc, eq, gte, sql } from 'drizzle-orm';
import { calculateQuotation, type QuotationInput } from '@/lib/quotation';
import { getDb, newId, schema } from './db';
import { currentPeriod, getEntitlements, type Entitlements } from './entitlements';
import { ApiError } from './http';

const { quotations } = schema;
export type QuotationRow = typeof quotations.$inferSelect;

/** Start (UTC ms) of the current calendar month in Asia/Manila (UTC+8, no DST). */
export function periodStart(now = new Date()): Date {
  const [year, month] = currentPeriod(now).split('-').map(Number) as [number, number];
  return new Date(Date.UTC(year, month - 1, 1) - 8 * 3600_000);
}

/** Free plans have no history: only quotations created in the current month are accessible. */
const accessFilter = (userId: string, entitlements: Entitlements) =>
  entitlements.limits.quotationHistory ? eq(quotations.userId, userId) : and(eq(quotations.userId, userId), gte(quotations.createdAt, periodStart()));

export async function getQuotaUsage(userId: string) {
  const row = await getDb()
    .select({ count: schema.usageCounters.count })
    .from(schema.usageCounters)
    .where(and(eq(schema.usageCounters.userId, userId), eq(schema.usageCounters.period, currentPeriod()), eq(schema.usageCounters.kind, 'quotation')))
    .get();
  return row?.count ?? 0;
}

export async function listQuotations(userId: string) {
  const entitlements = await getEntitlements(userId);
  const db = getDb();
  const [rows, used, total] = await Promise.all([
    db
      .select({ id: quotations.id, number: quotations.number, title: quotations.title, clientName: quotations.clientName, issueDate: quotations.issueDate, validUntil: quotations.validUntil, total: quotations.total, createdAt: quotations.createdAt })
      .from(quotations)
      .where(accessFilter(userId, entitlements))
      .orderBy(desc(quotations.createdAt))
      .limit(200),
    getQuotaUsage(userId),
    db.$count(quotations, eq(quotations.userId, userId)),
  ]);
  return { rows, used, entitlements, lockedCount: Math.max(0, total - rows.length) };
}

/** Loads one quotation the caller owns AND may access on their current plan. */
export async function getQuotation(userId: string, id: string) {
  const entitlements = await getEntitlements(userId);
  const db = getDb();
  const row = await db.select().from(quotations).where(and(eq(quotations.id, id), accessFilter(userId, entitlements))).get();
  if (row) return { row, entitlements };
  const exists = await db.select({ id: quotations.id }).from(quotations).where(and(eq(quotations.id, id), eq(quotations.userId, userId))).get();
  if (exists) throw new ApiError(402, 'Quotation history is a Premium feature. Upgrade to open past quotations.', 'upgrade_required');
  throw new ApiError(404, 'Quotation not found.');
}

/** Totals are always recomputed on the server; client-sent totals are ignored. */
function toColumns(input: QuotationInput) {
  const totals = calculateQuotation(input);
  return { ...input, subtotal: totals.subtotal, discountAmount: totals.discountAmount, taxAmount: totals.taxAmount, total: totals.total };
}

/**
 * Creates a quotation and consumes one unit of the monthly quota.
 * The counter upsert only succeeds while count < limit, so concurrent requests cannot exceed the plan.
 */
export async function createQuotation(userId: string, input: QuotationInput) {
  const entitlements = await getEntitlements(userId);
  const limit = entitlements.limits.quotationsPerMonth;
  const period = currentPeriod();
  const db = getDb();
  const reserved =
    limit > 0
      ? await db.all<{ count: number }>(sql`
          INSERT INTO usage_counters (user_id, period, kind, count) VALUES (${userId}, ${period}, 'quotation', 1)
          ON CONFLICT(user_id, period, kind) DO UPDATE SET count = count + 1 WHERE count < ${limit}
          RETURNING count`)
      : [];
  const sequence = reserved[0]?.count;
  if (!sequence)
    throw new ApiError(402, `You have used all ${limit} quotations for this month on the ${entitlements.plan === 'premium' ? 'Premium' : 'Free'} plan.`, 'limit_reached');

  const id = newId();
  const number = `Q-${period.replace('-', '')}-${String(sequence).padStart(3, '0')}`;
  try {
    await db.insert(quotations).values({ id, userId, number, ...toColumns(input) });
  } catch (error) {
    // Give the unit back if the insert itself failed.
    await db.run(sql`UPDATE usage_counters SET count = count - 1 WHERE user_id = ${userId} AND period = ${period} AND kind = 'quotation' AND count > 0`);
    throw error;
  }
  return { id, number };
}

export async function updateQuotation(userId: string, id: string, input: QuotationInput) {
  await getQuotation(userId, id);
  await getDb()
    .update(quotations)
    .set({ ...toColumns(input), updatedAt: new Date() })
    .where(and(eq(quotations.id, id), eq(quotations.userId, userId)));
}

export async function duplicateQuotation(userId: string, id: string) {
  const { row } = await getQuotation(userId, id);
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(new Date());
  const span = Math.max(0, Math.round((Date.parse(row.validUntil) - Date.parse(row.issueDate)) / 86_400_000));
  const validUntil = new Date(Date.parse(today) + span * 86_400_000).toISOString().slice(0, 10);
  return createQuotation(userId, {
    title: row.title,
    clientName: row.clientName,
    clientAddress: row.clientAddress,
    clientContact: row.clientContact,
    issueDate: today,
    validUntil,
    items: row.items,
    discountType: row.discountType,
    discountValue: row.discountValue,
    taxRateBps: row.taxRateBps,
    paymentTerms: row.paymentTerms,
    notes: row.notes,
  });
}

export async function deleteQuotation(userId: string, id: string) {
  const deleted = await getDb().delete(quotations).where(and(eq(quotations.id, id), eq(quotations.userId, userId))).returning({ id: quotations.id });
  if (!deleted.length) throw new ApiError(404, 'Quotation not found.');
}
