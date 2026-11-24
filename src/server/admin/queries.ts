import 'server-only';
import { sql, type SQL } from 'drizzle-orm';
import { getDb } from '../db';

export const ADMIN_PAGE_SIZE = 25;
const EXPORT_LIMIT = 5000;

export type ListParams = { q?: string; page?: number; status?: string; forExport?: boolean };
type Row = Record<string, string | number | null>;

const likePattern = (q: string) => `%${q.replace(/[\\%_]/g, '\\$&')}%`;
const paging = ({ page = 1, forExport }: ListParams) => (forExport ? sql`LIMIT ${EXPORT_LIMIT}` : sql`LIMIT ${ADMIN_PAGE_SIZE + 1} OFFSET ${(Math.max(1, page) - 1) * ADMIN_PAGE_SIZE}`);

async function run(query: SQL, params: ListParams) {
  const rows = await getDb().all<Row>(query);
  if (params.forExport) return { rows, hasMore: false };
  return { rows: rows.slice(0, ADMIN_PAGE_SIZE), hasMore: rows.length > ADMIN_PAGE_SIZE };
}

/** Each list is one bounded, indexed query; searching uses parameterised LIKE with escaped wildcards. */
export const adminLists = {
  users: (p: ListParams) => {
    const now = Date.now();
    const search = p.q ? sql`AND (u.email LIKE ${likePattern(p.q)} ESCAPE '\\' OR u.name LIKE ${likePattern(p.q)} ESCAPE '\\')` : sql``;
    const status = p.status === 'banned' ? sql`AND u.banned = 1` : p.status === 'premium' ? sql`AND s.status = 'active' AND s.current_period_end > ${now}` : p.status === 'unverified' ? sql`AND u.email_verified = 0` : sql``;
    return run(
      sql`SELECT u.id, u.name, u.email, u.role, u.email_verified AS emailVerified, u.banned, u.created_at AS createdAt, p.username,
                 CASE WHEN s.status = 'active' AND s.current_period_end > ${now} THEN 'premium' ELSE 'free' END AS plan
          FROM user u LEFT JOIN profiles p ON p.user_id = u.id LEFT JOIN subscriptions s ON s.user_id = u.id
          WHERE 1 = 1 ${search} ${status} ORDER BY u.created_at DESC ${paging(p)}`,
      p,
    );
  },
  profiles: (p: ListParams) => {
    const search = p.q ? sql`AND (p.business_name LIKE ${likePattern(p.q)} ESCAPE '\\' OR p.username LIKE ${likePattern(p.q)} ESCAPE '\\')` : sql``;
    const status = p.status === 'suspended' || p.status === 'active' ? sql`AND p.status = ${p.status}` : p.status === 'hidden' ? sql`AND p.is_published = 0` : sql``;
    return run(
      sql`SELECT p.id, p.username, p.business_name AS businessName, p.province, p.city, p.status, p.is_published AS isPublished, p.created_at AS createdAt,
                 (SELECT COUNT(*) FROM projects WHERE profile_id = p.id) AS projects,
                 (SELECT COUNT(*) FROM project_photos WHERE profile_id = p.id) AS photos
          FROM profiles p WHERE 1 = 1 ${search} ${status} ORDER BY p.created_at DESC ${paging(p)}`,
      p,
    );
  },
  subscriptions: (p: ListParams) => {
    const now = Date.now();
    const search = p.q ? sql`AND u.email LIKE ${likePattern(p.q)} ESCAPE '\\'` : sql``;
    const status = p.status === 'active' ? sql`AND s.status = 'active' AND s.current_period_end > ${now}` : p.status === 'expired' ? sql`AND (s.status = 'expired' OR (s.status = 'active' AND s.current_period_end <= ${now}))` : p.status === 'revoked' ? sql`AND s.status = 'revoked'` : sql``;
    return run(
      sql`SELECT s.id, s.user_id AS userId, u.email, s.interval, s.price_amount AS priceAmount, s.current_period_start AS periodStart, s.current_period_end AS periodEnd,
                 s.cancel_at_period_end AS cancelAtPeriodEnd,
                 CASE WHEN s.status = 'active' AND s.current_period_end <= ${now} THEN 'expired' ELSE s.status END AS status
          FROM subscriptions s JOIN user u ON u.id = s.user_id WHERE 1 = 1 ${search} ${status} ORDER BY s.current_period_end DESC ${paging(p)}`,
      p,
    );
  },
  transactions: (p: ListParams) => {
    const search = p.q ? sql`AND (u.email LIKE ${likePattern(p.q)} ESCAPE '\\' OR pay.provider_payment_id LIKE ${likePattern(p.q)} ESCAPE '\\' OR pay.id LIKE ${likePattern(p.q)} ESCAPE '\\')` : sql``;
    const status = p.status && ['pending', 'paid', 'failed', 'expired', 'refunded'].includes(p.status) ? sql`AND pay.status = ${p.status}` : sql``;
    return run(
      sql`SELECT pay.id, COALESCE(u.email, '(deleted account)') AS email, pay.interval, pay.status, pay.amount, pay.fee, pay.net_amount AS netAmount, pay.refunded_amount AS refundedAmount,
                 pay.payment_method AS paymentMethod, pay.provider_payment_id AS providerPaymentId, pay.livemode, pay.paid_at AS paidAt, pay.created_at AS createdAt
          FROM payments pay LEFT JOIN user u ON u.id = pay.user_id WHERE 1 = 1 ${search} ${status} ORDER BY pay.created_at DESC ${paging(p)}`,
      p,
    );
  },
  reports: (p: ListParams) => {
    const status = p.status && ['open', 'resolved', 'dismissed'].includes(p.status) ? sql`AND r.status = ${p.status}` : sql``;
    return run(
      sql`SELECT r.id, r.reason, r.details, r.reporter_email AS reporterEmail, r.status, r.created_at AS createdAt, p.id AS profileId, p.username, p.business_name AS businessName, p.status AS profileStatus,
                 CASE WHEN r.review_id IS NOT NULL THEN 'review' WHEN r.comment_id IS NOT NULL THEN 'comment' WHEN r.post_id IS NOT NULL THEN 'post' ELSE 'profile' END AS target,
                 r.post_id AS postId, r.comment_id AS commentId, r.review_id AS reviewId, substr(COALESCE(rv.body, c.body, po.body, ''), 1, 140) AS excerpt, COALESCE(rv.status, c.status, po.status) AS contentStatus
          FROM reports r JOIN profiles p ON p.id = r.profile_id LEFT JOIN posts po ON po.id = r.post_id LEFT JOIN post_comments c ON c.id = r.comment_id LEFT JOIN reviews rv ON rv.id = r.review_id WHERE 1 = 1 ${status} ORDER BY (r.status = 'open') DESC, r.created_at DESC ${paging(p)}`,
      p,
    );
  },
  posts: (p: ListParams) => {
    const search = p.q ? sql`AND (po.body LIKE ${likePattern(p.q)} ESCAPE '\\' OR pr.username LIKE ${likePattern(p.q)} ESCAPE '\\')` : sql``;
    const status = p.status === 'active' || p.status === 'hidden' ? sql`AND po.status = ${p.status}` : sql``;
    return run(
      sql`SELECT po.id, po.created_at AS createdAt, po.kind, substr(po.body, 1, 160) AS body, po.heart_count AS hearts, po.comment_count AS comments, po.status,
                 pr.id AS profileId, pr.username, pr.business_name AS businessName,
                 (SELECT COUNT(*) FROM reports r WHERE r.post_id = po.id AND r.status = 'open') AS openReports
          FROM posts po JOIN profiles pr ON pr.id = po.profile_id WHERE 1 = 1 ${search} ${status} ORDER BY po.created_at DESC ${paging(p)}`,
      p,
    );
  },
  reviews: (p: ListParams) => {
    const search = p.q ? sql`AND (rv.body LIKE ${likePattern(p.q)} ESCAPE '\\' OR pr.username LIKE ${likePattern(p.q)} ESCAPE '\\' OR u.email LIKE ${likePattern(p.q)} ESCAPE '\\')` : sql``;
    const status = p.status === 'active' || p.status === 'hidden' ? sql`AND rv.status = ${p.status}` : sql``;
    return run(
      sql`SELECT rv.id, rv.created_at AS createdAt, rv.rating, substr(rv.body, 1, 160) AS body, rv.verified, rv.status, u.email AS authorEmail,
                 pr.id AS profileId, pr.username, pr.business_name AS businessName,
                 (SELECT COUNT(*) FROM reports r WHERE r.review_id = rv.id AND r.status = 'open') AS openReports
          FROM reviews rv JOIN profiles pr ON pr.id = rv.profile_id JOIN user u ON u.id = rv.author_user_id WHERE 1 = 1 ${search} ${status} ORDER BY rv.created_at DESC ${paging(p)}`,
      p,
    );
  },
  audit: (p: ListParams) => {
    const search = p.q ? sql`AND (a.action LIKE ${likePattern(p.q)} ESCAPE '\\' OR a.target_id LIKE ${likePattern(p.q)} ESCAPE '\\' OR u.email LIKE ${likePattern(p.q)} ESCAPE '\\')` : sql``;
    const type = p.status && ['admin', 'user', 'system'].includes(p.status) ? sql`AND a.actor_type = ${p.status}` : sql``;
    return run(
      sql`SELECT a.id, a.created_at AS createdAt, a.actor_type AS actorType, COALESCE(u.email, '') AS actor, a.action, a.target_type AS targetType, a.target_id AS targetId, a.metadata, a.ip
          FROM audit_logs a LEFT JOIN user u ON u.id = a.actor_id WHERE 1 = 1 ${search} ${type} ORDER BY a.created_at DESC ${paging(p)}`,
      p,
    );
  },
} satisfies Record<string, (p: ListParams) => Promise<{ rows: Row[]; hasMore: boolean }>>;

export type AdminResource = keyof typeof adminLists;
export const isAdminResource = (value: string): value is AdminResource => value in adminLists;

/** RFC 4180 CSV with spreadsheet formula-injection protection (cells starting with = + - @ are prefixed). */
export function toCsv(rows: Row[]): string {
  if (!rows.length) return '';
  const headers = Object.keys(rows[0]!);
  const cell = (value: string | number | null) => {
    let text = value == null ? '' : String(value);
    if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
    return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  return [headers.join(','), ...rows.map((row) => headers.map((h) => cell(row[h] ?? null)).join(','))].join('\r\n');
}

export async function getSystemHealth() {
  const db = getDb();
  const started = Date.now();
  const counts = await db.get<Row>(sql`
    SELECT (SELECT COUNT(*) FROM user) AS users, (SELECT COUNT(*) FROM profiles) AS profiles, (SELECT COUNT(*) FROM projects) AS projects,
           (SELECT COUNT(*) FROM project_photos) AS photos, (SELECT COALESCE(SUM(size_bytes), 0) FROM project_photos) AS photoBytes,
           (SELECT COUNT(*) FROM quotations) AS quotations, (SELECT COUNT(*) FROM payments) AS payments, (SELECT COUNT(*) FROM audit_logs) AS auditLogs,
           (SELECT COUNT(*) FROM session) AS sessions,
           (SELECT page_count * page_size FROM pragma_page_count(), pragma_page_size()) AS dbBytes,
           (SELECT MAX(created_at) FROM audit_logs WHERE action = 'maintenance.daily') AS lastMaintenance,
           (SELECT MAX(received_at) FROM webhook_events) AS lastWebhook`);
  return { dbLatencyMs: Date.now() - started, counts: counts ?? {} };
}
