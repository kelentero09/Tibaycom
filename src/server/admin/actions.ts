import 'server-only';
import { and, desc, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { planConfigSchema } from '@/lib/plans';
import { audit } from '../audit';
import type { SessionUser } from '../auth';
import { getDb, newId, schema } from '../db';
import { PLAN_SETTINGS_KEY } from '../entitlements';
import { ApiError } from '../http';
import { deleteImages } from '../storage';

const id = z.string().min(1).max(64);

/** Every administrative mutation: validated input, executed server-side, and written to the audit log. */
export const adminActionSchemas = {
  'user.ban': z.object({ userId: id, reason: z.string().trim().max(300).default('') }),
  'user.unban': z.object({ userId: id }),
  'profile.suspend': z.object({ profileId: id }),
  'profile.restore': z.object({ profileId: id }),
  'project.delete': z.object({ projectId: id }),
  'post.hide': z.object({ postId: id }),
  'post.restore': z.object({ postId: id }),
  'comment.hide': z.object({ commentId: id }),
  'review.hide': z.object({ reviewId: id }),
  'review.restore': z.object({ reviewId: id }),
  'report.resolve': z.object({ reportId: id }),
  'report.dismiss': z.object({ reportId: id }),
  'subscription.grant': z.object({ userId: id, days: z.number().int().min(1).max(366) }),
  'subscription.revoke': z.object({ userId: id }),
  'settings.plans': planConfigSchema,
  'alert.test': z.object({}),
} as const;

export type AdminAction = keyof typeof adminActionSchemas;
export const isAdminAction = (value: string): value is AdminAction => value in adminActionSchemas;

type Ctx = { admin: SessionUser; ip: string };
type Handlers = { [K in AdminAction]: (input: z.infer<(typeof adminActionSchemas)[K]>, ctx: Ctx) => Promise<{ targetType: string; targetId: string; metadata?: Record<string, unknown> }> };

const handlers: Handlers = {
  'user.ban': async ({ userId, reason }, { admin }) => {
    const db = getDb();
    if (userId === admin.id) throw new ApiError(400, 'You cannot ban your own account.');
    const target = await db.select({ role: schema.user.role }).from(schema.user).where(eq(schema.user.id, userId)).get();
    if (!target) throw new ApiError(404, 'User not found.');
    if (target.role === 'admin') throw new ApiError(400, 'Administrator accounts cannot be banned from the dashboard.');
    // Remember whether the ban is what suspends the profile, so an unban never undoes a separate moderation suspension.
    const profile = await db.select({ status: schema.profiles.status }).from(schema.profiles).where(eq(schema.profiles.userId, userId)).get();
    const profileWasActive = profile?.status === 'active';
    await db.batch([
      db.update(schema.user).set({ banned: true, banReason: reason || 'Violation of terms', updatedAt: new Date() }).where(eq(schema.user.id, userId)),
      db.delete(schema.session).where(eq(schema.session.userId, userId)), // sign out everywhere, immediately
      db.update(schema.profiles).set({ status: 'suspended', updatedAt: new Date() }).where(eq(schema.profiles.userId, userId)),
    ]);
    return { targetType: 'user', targetId: userId, metadata: { reason, profileWasActive } };
  },
  'user.unban': async ({ userId }) => {
    const db = getDb();
    const lastBan = await db
      .select({ metadata: schema.auditLogs.metadata })
      .from(schema.auditLogs)
      .where(and(eq(schema.auditLogs.action, 'admin.user.ban'), eq(schema.auditLogs.targetId, userId)))
      .orderBy(desc(schema.auditLogs.createdAt))
      .get();
    // Older bans have no flag: keep the previous behaviour (restore) for them.
    const restoreProfile = lastBan?.metadata?.profileWasActive !== false;
    const unban = db.update(schema.user).set({ banned: false, banReason: null, banExpires: null, updatedAt: new Date() }).where(eq(schema.user.id, userId));
    if (restoreProfile) await db.batch([unban, db.update(schema.profiles).set({ status: 'active', updatedAt: new Date() }).where(eq(schema.profiles.userId, userId))]);
    else await unban;
    return { targetType: 'user', targetId: userId, metadata: { profileRestored: restoreProfile } };
  },
  'profile.suspend': async ({ profileId }) => {
    const updated = await getDb().update(schema.profiles).set({ status: 'suspended', updatedAt: new Date() }).where(eq(schema.profiles.id, profileId)).returning({ id: schema.profiles.id });
    if (!updated.length) throw new ApiError(404, 'Profile not found.');
    return { targetType: 'profile', targetId: profileId };
  },
  'profile.restore': async ({ profileId }) => {
    const updated = await getDb().update(schema.profiles).set({ status: 'active', updatedAt: new Date() }).where(eq(schema.profiles.id, profileId)).returning({ id: schema.profiles.id });
    if (!updated.length) throw new ApiError(404, 'Profile not found.');
    return { targetType: 'profile', targetId: profileId };
  },
  'project.delete': async ({ projectId }) => {
    const db = getDb();
    const project = await db.select().from(schema.projects).where(eq(schema.projects.id, projectId)).get();
    if (!project) throw new ApiError(404, 'Project not found.');
    const photos = await db.select({ key: schema.projectPhotos.key }).from(schema.projectPhotos).where(eq(schema.projectPhotos.projectId, projectId));
    await db.delete(schema.projects).where(eq(schema.projects.id, projectId));
    await deleteImages(photos.map((p) => p.key));
    return { targetType: 'project', targetId: projectId, metadata: { title: project.title, profileId: project.profileId, photos: photos.length } };
  },
  'post.hide': ({ postId }) => setPostStatus(postId, 'hidden'),
  'post.restore': ({ postId }) => setPostStatus(postId, 'active'),
  'comment.hide': async ({ commentId }) => {
    const db = getDb();
    const updated = await db
      .update(schema.postComments)
      .set({ status: 'hidden' })
      .where(eq(schema.postComments.id, commentId))
      .returning({ postId: schema.postComments.postId });
    if (!updated.length) throw new ApiError(404, 'Comment not found.');
    const postId = updated[0]!.postId;
    await db.run(sql`UPDATE posts SET comment_count = (SELECT COUNT(*) FROM post_comments WHERE post_id = ${postId} AND status = 'active') WHERE id = ${postId}`);
    return { targetType: 'comment', targetId: commentId, metadata: { postId } };
  },
  'review.hide': ({ reviewId }) => setReviewStatus(reviewId, 'hidden'),
  'review.restore': ({ reviewId }) => setReviewStatus(reviewId, 'active'),
  'report.resolve': ({ reportId }, ctx) => closeReport(reportId, 'resolved', ctx),
  'report.dismiss': ({ reportId }, ctx) => closeReport(reportId, 'dismissed', ctx),
  'subscription.grant': async ({ userId, days }) => {
    const db = getDb();
    const now = Date.now();
    const exists = await db.select({ id: schema.user.id }).from(schema.user).where(eq(schema.user.id, userId)).get();
    if (!exists) throw new ApiError(404, 'User not found.');
    const addMs = days * 86_400_000;
    // Complimentary time: price 0 for a brand-new subscription so MRR/ARR are not inflated; an existing paid plan keeps its price.
    await db.run(sql`
      INSERT INTO subscriptions (id, user_id, interval, status, price_amount, current_period_start, current_period_end, cancel_at_period_end, created_at, updated_at)
      VALUES (${newId()}, ${userId}, 'monthly', 'active', 0, ${now}, ${now + addMs}, 0, ${now}, ${now})
      ON CONFLICT(user_id) DO UPDATE SET
        price_amount = CASE WHEN subscriptions.status = 'active' AND subscriptions.current_period_end > ${now} THEN subscriptions.price_amount ELSE 0 END,
        current_period_start = CASE WHEN subscriptions.status = 'active' AND subscriptions.current_period_end > ${now} THEN subscriptions.current_period_start ELSE ${now} END,
        current_period_end = MAX(${now}, CASE WHEN subscriptions.status = 'active' THEN subscriptions.current_period_end ELSE 0 END) + ${addMs},
        status = 'active', reminder_sent_at = NULL, updated_at = ${now}`);
    return { targetType: 'user', targetId: userId, metadata: { days } };
  },
  'subscription.revoke': async ({ userId }) => {
    const updated = await getDb()
      .update(schema.subscriptions)
      .set({ status: 'revoked', currentPeriodEnd: new Date(), updatedAt: new Date() })
      .where(and(eq(schema.subscriptions.userId, userId), eq(schema.subscriptions.status, 'active')))
      .returning({ id: schema.subscriptions.id });
    if (!updated.length) throw new ApiError(404, 'No active subscription for this user.');
    return { targetType: 'user', targetId: userId };
  },
  'alert.test': async (_input, { admin }) => {
    const { reportProblem } = await import('../alerts');
    await getDb().run(sql`UPDATE alerts SET last_notified_at = NULL WHERE kind = 'test'`); // a test always sends
    await reportProblem('test', `Test alert requested by ${admin.email}. If you can read this, alerting works.`);
    return { targetType: 'alert', targetId: 'test' };
  },
  'settings.plans': async (config, { admin }) => {
    await getDb()
      .insert(schema.settings)
      .values({ key: PLAN_SETTINGS_KEY, value: config, updatedBy: admin.id })
      .onConflictDoUpdate({ target: schema.settings.key, set: { value: config, updatedBy: admin.id, updatedAt: new Date() } });
    return { targetType: 'settings', targetId: PLAN_SETTINGS_KEY, metadata: { pricing: config.pricing } };
  },
};

async function setPostStatus(postId: string, status: 'active' | 'hidden') {
  const updated = await getDb().update(schema.posts).set({ status, updatedAt: new Date() }).where(eq(schema.posts.id, postId)).returning({ id: schema.posts.id });
  if (!updated.length) throw new ApiError(404, 'Post not found.');
  return { targetType: 'post', targetId: postId };
}

async function setReviewStatus(reviewId: string, status: 'active' | 'hidden') {
  const updated = await getDb().update(schema.reviews).set({ status }).where(eq(schema.reviews.id, reviewId)).returning({ id: schema.reviews.id });
  if (!updated.length) throw new ApiError(404, 'Review not found.');
  return { targetType: 'review', targetId: reviewId };
}

async function closeReport(reportId: string, status: 'resolved' | 'dismissed', { admin }: Ctx) {
  const updated = await getDb().update(schema.reports).set({ status, resolvedBy: admin.id, resolvedAt: new Date() }).where(eq(schema.reports.id, reportId)).returning({ id: schema.reports.id });
  if (!updated.length) throw new ApiError(404, 'Report not found.');
  return { targetType: 'report', targetId: reportId };
}

export async function runAdminAction<K extends AdminAction>(action: K, input: z.infer<(typeof adminActionSchemas)[K]>, ctx: Ctx) {
  const result = await handlers[action](input, ctx);
  await audit({ actorId: ctx.admin.id, actorType: 'admin', action: `admin.${action}`, ip: ctx.ip, ...result });
  return { ok: true };
}
