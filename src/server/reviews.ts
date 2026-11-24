import 'server-only';
import { and, desc, eq, sql } from 'drizzle-orm';
import { isProfessionalIntent } from '@/lib/community';
import { getDb, getEnv, newId, schema } from './db';
import { sendEmail } from './email';
import { ApiError } from './http';

const { reviews, profiles, user } = schema;

/** Reviews count only while visible and while their author is not banned (banning a spammer removes their ratings). */
const visibleSql = (alias: string) => sql.raw(`${alias}.status = 'active' AND NOT EXISTS (SELECT 1 FROM user bu WHERE bu.id = ${alias}.author_user_id AND bu.banned = 1)`);

export type RatingSummary = { average: number; count: number };

/** Average rating (1 decimal) and count per profile, for cards. Profiles without reviews are absent. */
export async function getRatings(profileIds: string[]): Promise<Map<string, RatingSummary>> {
  if (!profileIds.length) return new Map();
  const rows = await getDb()
    .select({ profileId: sql<string>`r.profile_id`, average: sql<number>`AVG(r.rating)`, count: sql<number>`COUNT(*)` })
    .from(sql`reviews r`)
    .where(sql`r.profile_id IN (${sql.join(profileIds.map((id) => sql`${id}`), sql`, `)}) AND ${visibleSql('r')}`)
    .groupBy(sql`r.profile_id`);
  return new Map(rows.map((r) => [r.profileId, { average: Math.round(Number(r.average) * 10) / 10, count: Number(r.count) }]));
}

export type ReviewSummary = RatingSummary & { distribution: [number, number, number, number, number] };

export async function getReviewSummary(profileId: string): Promise<ReviewSummary> {
  const rows = await getDb().all<{ rating: number; n: number }>(sql`SELECT r.rating AS rating, COUNT(*) AS n FROM reviews r WHERE r.profile_id = ${profileId} AND ${visibleSql('r')} GROUP BY r.rating`);
  const distribution: ReviewSummary['distribution'] = [0, 0, 0, 0, 0];
  let total = 0;
  let sum = 0;
  for (const r of rows) {
    distribution[r.rating - 1] = Number(r.n);
    total += Number(r.n);
    sum += r.rating * Number(r.n);
  }
  return { average: total ? Math.round((sum / total) * 10) / 10 : 0, count: total, distribution };
}

export type ReviewItem = {
  id: string;
  rating: number;
  body: string;
  verified: boolean;
  ownerReply: string | null;
  ownerReplyAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  authorUserId: string;
  /** Business name when the author has a public profile, otherwise "First L." from the account name. */
  authorName: string;
  authorUsername: string | null;
  authorAvatarKey: string | null;
};

/** "Maria Lourdes Santos" → "Maria S." — members without a public profile are not fully named. */
export function shortName(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return 'Tibay member';
  return parts.length === 1 ? parts[0]! : `${parts[0]} ${parts.at(-1)![0]!.toUpperCase()}.`;
}

export async function listReviews(profileId: string, limit = 50): Promise<ReviewItem[]> {
  const rows = await getDb()
    .select({
      id: reviews.id,
      rating: reviews.rating,
      body: reviews.body,
      verified: reviews.verified,
      ownerReply: reviews.ownerReply,
      ownerReplyAt: reviews.ownerReplyAt,
      createdAt: reviews.createdAt,
      updatedAt: reviews.updatedAt,
      authorUserId: reviews.authorUserId,
      userName: user.name,
      profileName: profiles.businessName,
      profileUsername: profiles.username,
      profileAvatar: profiles.avatarKey,
      profilePublic: sql<number>`${profiles.status} = 'active' AND ${profiles.isPublished} = 1`,
    })
    .from(reviews)
    .innerJoin(user, eq(user.id, reviews.authorUserId))
    .leftJoin(profiles, eq(profiles.userId, reviews.authorUserId))
    .where(and(eq(reviews.profileId, profileId), eq(reviews.status, 'active'), sql`COALESCE(${user.banned}, 0) = 0`))
    .orderBy(desc(reviews.createdAt))
    .limit(limit);
  return rows.map((r) => {
    const isPublic = !!r.profilePublic && !!r.profileUsername;
    return {
      id: r.id,
      rating: r.rating,
      body: r.body,
      verified: r.verified,
      ownerReply: r.ownerReply,
      ownerReplyAt: r.ownerReplyAt,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      authorUserId: r.authorUserId,
      authorName: isPublic ? r.profileName! : shortName(r.userName),
      authorUsername: isPublic ? r.profileUsername : null,
      authorAvatarKey: isPublic ? r.profileAvatar : null,
    };
  });
}

export async function getOwnReview(profileId: string, userId: string) {
  return getDb().select().from(reviews).where(and(eq(reviews.profileId, profileId), eq(reviews.authorUserId, userId))).get();
}

/** Writes (or replaces) the member's review of a professional. */
export async function upsertReview(username: string, authorUserId: string, input: { rating: number; body: string }) {
  const db = getDb();
  const target = await db
    .select({ id: profiles.id, userId: profiles.userId, businessName: profiles.businessName, intent: profiles.intent, status: profiles.status, isPublished: profiles.isPublished, contactEmail: profiles.contactEmail, accountEmail: user.email })
    .from(profiles)
    .innerJoin(user, eq(user.id, profiles.userId))
    .where(eq(profiles.username, username.toLowerCase()))
    .get();
  if (!target || target.status !== 'active' || !target.isPublished) throw new ApiError(404, 'Profile not found.');
  if (!isProfessionalIntent(target.intent)) throw new ApiError(400, 'Only professionals can be reviewed.');
  if (target.userId === authorUserId) throw new ApiError(403, 'You cannot review your own page.', 'own_profile');

  const contacted = await db
    .select({ id: schema.inquiries.id })
    .from(schema.inquiries)
    .where(and(eq(schema.inquiries.profileId, target.id), eq(schema.inquiries.senderUserId, authorUserId)))
    .get();
  const existing = await getOwnReview(target.id, authorUserId);
  const now = new Date();
  const [row] = await db
    .insert(reviews)
    .values({ id: newId(), profileId: target.id, authorUserId, rating: input.rating, body: input.body, verified: !!contacted })
    .onConflictDoUpdate({
      target: [reviews.profileId, reviews.authorUserId],
      // Editing keeps the owner's public reply.
      set: { rating: input.rating, body: input.body, verified: !!contacted, updatedAt: now },
    })
    .returning();

  if (!existing)
    await sendEmail({
      to: target.contactEmail || target.accountEmail,
      subject: `New ${input.rating}-star review on Tibay`,
      heading: 'You have a new review',
      paragraphs: [`Someone rated ${target.businessName} ${input.rating} out of 5:`, input.body, 'You can reply publicly from your page.'],
      action: { label: 'See the review', url: `${getEnv().PUBLIC_SITE_URL}/p/${username.toLowerCase()}#reviews` },
    });
  return { review: row!, created: !existing };
}

/** The review's author removes it. */
export async function deleteOwnReview(reviewId: string, userId: string) {
  const deleted = await getDb().delete(reviews).where(and(eq(reviews.id, reviewId), eq(reviews.authorUserId, userId))).returning({ id: reviews.id });
  if (!deleted.length) throw new ApiError(404, 'Review not found.');
}

/** The reviewed professional answers publicly (empty body removes the reply). */
export async function replyToReview(reviewId: string, ownerProfileId: string, body: string) {
  const updated = await getDb()
    .update(reviews)
    .set({ ownerReply: body || null, ownerReplyAt: body ? new Date() : null })
    .where(and(eq(reviews.id, reviewId), eq(reviews.profileId, ownerProfileId)))
    .returning({ id: reviews.id });
  if (!updated.length) throw new ApiError(404, 'Review not found.');
}

/** Site-wide totals for honest social proof on the home page. */
export async function getCommunityStats() {
  const row = await getDb().get<{ members: number; professionals: number; projects: number; reviews: number }>(sql`
    SELECT (SELECT COUNT(*) FROM user WHERE COALESCE(banned, 0) = 0) AS members,
           (SELECT COUNT(*) FROM profiles WHERE status = 'active' AND is_published = 1 AND intent != 'seeking_contractor') AS professionals,
           (SELECT COUNT(*) FROM projects) AS projects,
           (SELECT COUNT(*) FROM reviews r WHERE ${visibleSql('r')}) AS reviews`);
  return { members: Number(row?.members ?? 0), professionals: Number(row?.professionals ?? 0), projects: Number(row?.projects ?? 0), reviews: Number(row?.reviews ?? 0) };
}

