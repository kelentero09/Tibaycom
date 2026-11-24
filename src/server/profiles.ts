import 'server-only';
import { and, asc, desc, eq, exists, inArray, ne, sql } from 'drizzle-orm';
import type { DirectoryQuery } from '@/lib/validation';
import { getDb, schema } from './db';
import { getEntitlements, premiumSql, type Entitlements } from './entitlements';
import { ApiError } from './http';
import { getRatings, type RatingSummary } from './reviews';

const { profiles, profileProfessions, profileSpecializations, projects, projectPhotos } = schema;

export type ProfileRow = typeof profiles.$inferSelect;
export const DIRECTORY_PAGE_SIZE = 12;

export async function getProfileByUserId(userId: string) {
  return getDb().select().from(profiles).where(eq(profiles.userId, userId)).get();
}

/** Resource-ownership gate used by every mutation: resolves the caller's own profile or fails. */
export async function requireOwnProfile(userId: string) {
  const profile = await getProfileByUserId(userId);
  if (!profile) throw new ApiError(409, 'Create your profile first.', 'no_profile');
  if (profile.status === 'suspended') throw new ApiError(403, 'Your profile is suspended. Contact support for help.', 'suspended');
  return profile;
}

async function loadTags(profileIds: string[]) {
  if (!profileIds.length) return { professions: new Map<string, string[]>(), specializations: new Map<string, string[]>() };
  const db = getDb();
  const [profs, specs] = await Promise.all([
    db.select().from(profileProfessions).where(inArray(profileProfessions.profileId, profileIds)),
    db.select().from(profileSpecializations).where(inArray(profileSpecializations.profileId, profileIds)),
  ]);
  const group = <T extends { profileId: string }>(rows: T[], pick: (r: T) => string) => {
    const map = new Map<string, string[]>();
    for (const r of rows) map.set(r.profileId, [...(map.get(r.profileId) ?? []), pick(r)]);
    return map;
  };
  return { professions: group(profs, (r) => r.profession), specializations: group(specs, (r) => r.specialization) };
}

export type ProjectWithPhotos = typeof projects.$inferSelect & { photos: { id: string; key: string }[] };

export async function getProjects(profileId: string, limit?: number): Promise<ProjectWithPhotos[]> {
  const db = getDb();
  const base = db.select().from(projects).where(eq(projects.profileId, profileId)).orderBy(asc(projects.createdAt));
  const rows = await (limit === undefined ? base : base.limit(limit));
  if (!rows.length) return [];
  const photos = await db
    .select({ id: projectPhotos.id, key: projectPhotos.key, projectId: projectPhotos.projectId })
    .from(projectPhotos)
    .where(inArray(projectPhotos.projectId, rows.map((r) => r.id)))
    .orderBy(asc(projectPhotos.sortOrder), asc(projectPhotos.createdAt));
  return rows.map((p) => ({ ...p, photos: photos.filter((ph) => ph.projectId === p.id).map(({ id, key }) => ({ id, key })) }));
}

export type ProjectUpdateRow = typeof schema.projectUpdates.$inferSelect;

/** Timeline entries for one project, oldest first. Visitors see at most the owner's current plan allowance. */
export async function getProjectUpdates(projectId: string, limit?: number): Promise<ProjectUpdateRow[]> {
  const base = getDb()
    .select()
    .from(schema.projectUpdates)
    .where(eq(schema.projectUpdates.projectId, projectId))
    .orderBy(asc(schema.projectUpdates.date), asc(schema.projectUpdates.createdAt));
  return limit === undefined ? base : base.limit(limit);
}

/** Number of timeline entries per project, for cards and the timeline section. */
export async function countProjectUpdates(projectIds: string[]) {
  if (!projectIds.length) return new Map<string, number>();
  const rows = await getDb()
    .select({ projectId: schema.projectUpdates.projectId, n: sql<number>`count(*)` })
    .from(schema.projectUpdates)
    .where(inArray(schema.projectUpdates.projectId, projectIds))
    .groupBy(schema.projectUpdates.projectId);
  return new Map(rows.map((r) => [r.projectId, r.n]));
}

export type FullProfile = {
  profile: ProfileRow;
  professions: string[];
  specializations: string[];
  projects: ProjectWithPhotos[];
  entitlements: Entitlements;
  /** Projects hidden from the public because the owner is over the current plan's limit. */
  hiddenProjectCount: number;
};

/**
 * Loads a profile for display. Visitors only ever receive what the owner's *current* plan allows
 * (oldest projects first, photos capped per project, no cover on Free) — a lapsed Premium loses the extras without data loss.
 * `preview` lets the owner see exactly that visitor view of their own page.
 */
export async function getFullProfile(username: string, viewerId: string | null, viewerIsAdmin = false, preview = false): Promise<(FullProfile & { isOwner: boolean }) | null> {
  const profile = await getDb().select().from(profiles).where(eq(profiles.username, username.toLowerCase())).get();
  if (!profile) return null;
  const isOwner = viewerId === profile.userId;
  if (!isOwner && !viewerIsAdmin && (profile.status !== 'active' || !profile.isPublished)) return null;
  const asVisitor = !isOwner || preview;

  const [tags, entitlements, allProjects] = await Promise.all([loadTags([profile.id]), getEntitlements(profile.userId), getProjects(profile.id)]);
  let visible = allProjects;
  if (asVisitor) {
    const perProject = entitlements.limits.photosPerProject;
    visible = allProjects.slice(0, entitlements.limits.projects).map((p) => ({ ...p, photos: p.photos.slice(0, perProject) }));
  }
  return {
    profile: asVisitor && !entitlements.limits.customCoverPhoto ? { ...profile, coverKey: null } : profile,
    professions: tags.professions.get(profile.id) ?? [],
    specializations: tags.specializations.get(profile.id) ?? [],
    projects: visible,
    entitlements,
    hiddenProjectCount: Math.max(0, allProjects.length - entitlements.limits.projects),
    isOwner,
  };
}

export type DirectoryCard = Pick<ProfileRow, 'id' | 'username' | 'businessName' | 'bio' | 'province' | 'city' | 'avatarKey' | 'logoKey' | 'yearsExperience' | 'intent'> & {
  professions: string[];
  /** Paid Premium right now: listed first and marked "Featured". */
  isPremium: boolean;
  /** Average star rating, or null before the first review. */
  rating: RatingSummary | null;
};

/** Profile photos of recently active public members, for the small avatar stack on the home page. */
export async function getMemberAvatars(limit = 5) {
  return getDb()
    .select({ username: profiles.username, businessName: profiles.businessName, avatarKey: profiles.avatarKey })
    .from(profiles)
    .where(and(eq(profiles.status, 'active'), eq(profiles.isPublished, true), sql`${profiles.avatarKey} IS NOT NULL`))
    .orderBy(desc(profiles.updatedAt))
    .limit(limit);
}

/** Paginated directory search. Fetches one extra row instead of running a COUNT(*). */
export async function searchDirectory(query: DirectoryQuery): Promise<{ results: DirectoryCard[]; hasMore: boolean }> {
  const db = getDb();
  // Homeowners looking for a contractor have a profile for the community but are never listed as professionals.
  const conditions = [eq(profiles.status, 'active'), eq(profiles.isPublished, true), ne(profiles.intent, 'seeking_contractor')];
  if (query.intent && query.intent !== 'seeking_contractor') conditions.push(eq(profiles.intent, query.intent));
  if (query.province) conditions.push(eq(profiles.province, query.province));
  if (query.province && query.city) conditions.push(eq(profiles.city, query.city));
  if (query.q) {
    const pattern = `%${query.q.replace(/[\\%_]/g, '\\$&')}%`;
    conditions.push(
      sql`(${profiles.businessName} LIKE ${pattern} ESCAPE '\\' OR EXISTS (SELECT 1 FROM profile_professions pp WHERE pp.profile_id = ${profiles.id} AND pp.profession LIKE ${pattern} ESCAPE '\\'))`,
    );
  }
  if (query.profession)
    conditions.push(
      exists(db.select({ x: sql`1` }).from(profileProfessions).where(and(eq(profileProfessions.profileId, profiles.id), eq(profileProfessions.profession, query.profession)))),
    );
  if (query.specialization)
    conditions.push(
      exists(
        db.select({ x: sql`1` }).from(profileSpecializations).where(and(eq(profileSpecializations.profileId, profiles.id), eq(profileSpecializations.specialization, query.specialization))),
      ),
    );

  const rows = await db
    .select({
      id: profiles.id,
      username: profiles.username,
      businessName: profiles.businessName,
      bio: profiles.bio,
      province: profiles.province,
      city: profiles.city,
      avatarKey: profiles.avatarKey,
      logoKey: profiles.logoKey,
      yearsExperience: profiles.yearsExperience,
      intent: profiles.intent,
      isPremium: premiumSql('profiles'),
    })
    .from(profiles)
    .where(and(...conditions))
    // Premium members rank first; within each group the most recently updated profiles lead.
    .orderBy(desc(premiumSql('profiles')), desc(profiles.updatedAt), desc(profiles.id))
    .limit(DIRECTORY_PAGE_SIZE + 1)
    .offset((query.page - 1) * DIRECTORY_PAGE_SIZE);

  const page = rows.slice(0, DIRECTORY_PAGE_SIZE);
  const ids = page.map((r) => r.id);
  const [tags, ratings] = await Promise.all([loadTags(ids), getRatings(ids)]);
  return {
    results: page.map((r) => ({ ...r, isPremium: !!r.isPremium, professions: tags.professions.get(r.id) ?? [], rating: ratings.get(r.id) ?? null })),
    hasMore: rows.length > DIRECTORY_PAGE_SIZE,
  };
}

/** Replaces the profession / specialization tag sets for a profile in one batch. */
export function tagStatements(profileId: string, professions: string[], specializations: string[]) {
  const db = getDb();
  return [
    db.delete(profileProfessions).where(eq(profileProfessions.profileId, profileId)),
    db.delete(profileSpecializations).where(eq(profileSpecializations.profileId, profileId)),
    ...(professions.length ? [db.insert(profileProfessions).values(professions.map((profession) => ({ profileId, profession })))] : []),
    ...(specializations.length ? [db.insert(profileSpecializations).values(specializations.map((specialization) => ({ profileId, specialization })))] : []),
  ] as const;
}

export type InquiryRow = typeof schema.inquiries.$inferSelect;

export async function countNewInquiries(profileId: string) {
  return getDb().$count(schema.inquiries, and(eq(schema.inquiries.profileId, profileId), eq(schema.inquiries.status, 'new')));
}

export async function listInquiries(profileId: string, archived: boolean): Promise<InquiryRow[]> {
  const status = archived ? eq(schema.inquiries.status, 'archived') : sql`${schema.inquiries.status} != 'archived'`;
  return getDb().select().from(schema.inquiries).where(and(eq(schema.inquiries.profileId, profileId), status)).orderBy(desc(sql`COALESCE(${schema.inquiries.lastMessageAt}, ${schema.inquiries.createdAt})`)).limit(100);
}
