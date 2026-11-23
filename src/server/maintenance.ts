import 'server-only';
import { eq, inArray, lt, sql } from 'drizzle-orm';
import { reportProblem } from './alerts';
import { audit } from './audit';
import { runSubscriptionMaintenance } from './billing';
import { getDb, getEnv, schema } from './db';

const CURSOR_KEY = 'r2_cleanup_cursor';
const ORPHAN_GRACE_MS = 24 * 3600_000;
export const INQUIRY_RETENTION_DAYS = 180;
const chunk = <T>(list: T[], size: number) => Array.from({ length: Math.ceil(list.length / size) }, (_, i) => list.slice(i * size, (i + 1) * size));

/**
 * Deletes R2 objects no database row points to (e.g. an upload whose request died half-way).
 * Walks the bucket incrementally — one page per day — so it stays far inside free-tier operation limits.
 */
export async function cleanupOrphanedImages(pageSize = 500) {
  const db = getDb();
  const bucket = getEnv().BUCKET;
  const saved = await db.select().from(schema.settings).where(eq(schema.settings.key, CURSOR_KEY)).get();
  const listing = await bucket.list({ limit: pageSize, cursor: typeof saved?.value === 'string' && saved.value ? saved.value : undefined });

  const cutoff = Date.now() - ORPHAN_GRACE_MS;
  const candidates = listing.objects.filter((o) => o.uploaded.getTime() < cutoff).map((o) => o.key);
  const referenced = new Set<string>();
  // D1 allows 100 bound parameters per statement.
  for (const keys of chunk(candidates, 90)) {
    const [photos, profiles] = await Promise.all([
      db.select({ key: schema.projectPhotos.key }).from(schema.projectPhotos).where(inArray(schema.projectPhotos.key, keys)),
      db
        .select({ a: schema.profiles.avatarKey, l: schema.profiles.logoKey, c: schema.profiles.coverKey })
        .from(schema.profiles)
        .where(sql`${inArray(schema.profiles.avatarKey, keys)} OR ${inArray(schema.profiles.logoKey, keys)} OR ${inArray(schema.profiles.coverKey, keys)}`),
    ]);
    photos.forEach((p) => referenced.add(p.key));
    profiles.forEach((p) => [p.a, p.l, p.c].forEach((k) => k && referenced.add(k)));
  }
  const orphans = candidates.filter((key) => !referenced.has(key));
  for (const keys of chunk(orphans, 500)) await bucket.delete(keys);

  const nextCursor = listing.truncated ? listing.cursor : '';
  await db
    .insert(schema.settings)
    .values({ key: CURSOR_KEY, value: nextCursor })
    .onConflictDoUpdate({ target: schema.settings.key, set: { value: nextCursor, updatedAt: new Date() } });
  return { scanned: listing.objects.length, deleted: orphans.length };
}

/** Housekeeping that keeps small tables small. */
async function pruneExpiredRows(now = Date.now()) {
  const db = getDb();
  await db.batch([
    db.delete(schema.rateLimit).where(lt(schema.rateLimit.lastRequest, now - 2 * 86_400_000)),
    db.delete(schema.webhookEvents).where(lt(schema.webhookEvents.receivedAt, new Date(now - 60 * 86_400_000))),
    db.delete(schema.verification).where(lt(schema.verification.expiresAt, new Date(now - 86_400_000))),
    db.delete(schema.session).where(lt(schema.session.expiresAt, new Date(now))),
    db.delete(schema.inquiries).where(lt(schema.inquiries.createdAt, new Date(now - INQUIRY_RETENTION_DAYS * 86_400_000))),
  ]);
}

export async function runDailyMaintenance() {
  const result: Record<string, unknown> = {};
  for (const [name, task] of [
    ['subscriptions', () => runSubscriptionMaintenance()],
    ['images', () => cleanupOrphanedImages()],
    ['prune', () => pruneExpiredRows()],
  ] as const) {
    try {
      result[name] = (await task()) ?? 'ok';
    } catch (error) {
      await reportProblem('maintenance', `Daily job "${name}" failed: ${String(error).slice(0, 300)}`);
      result[name] = 'error';
    }
  }
  await audit({ actorType: 'system', action: 'maintenance.daily', metadata: result });
  return result;
}
