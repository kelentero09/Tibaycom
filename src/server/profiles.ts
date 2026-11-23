import 'server-only';
import { and, asc, desc, eq, exists, inArray, sql } from 'drizzle-orm';
import type { DirectoryQuery } from '@/lib/validation';
import { getDb, schema } from './db';
import { getEntitlements, type Entitlements } from './entitlements';
import { ApiError } from './http';

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
 */
export async function getFullProfile(username: string, viewerId: string | null, viewerIsAdmin = false): Promise<(FullProfile & { isOwner: boolean }) | null> {
  const profile = await getDb().select().from(profiles).where(eq(profiles.username, username.toLowerCase())).get();
  if (!profile) return null;
  const isOwner = viewerId === profile.userId;
  if (!isOwner && !viewerIsAdmin && (profile.status !== 'active' || !profile.isPublished)) return null;

  const [tags, entitlements, allProjects] = await Promise.all([loadTags([profile.id]), getEntitlements(profile.userId), getProjects(profile.id)]);
  let visible = allProjects;
  if (!isOwner) {
    const perProject = entitlements.limits.photosPerProject;
    visible = allProjects.slice(0, entitlements.limits.projects).map((p) => ({ ...p, photos: p.photos.slice(0, perProject) }));
  }
  return {
    profile: !isOwner && !entitlements.limits.customCoverPhoto ? { ...profile, coverKey: null } : profile,
    professions: tags.professions.get(profile.id) ?? [],
    specializations: tags.specializations.get(profile.id) ?? [],
    projects: visible,
    entitlements,
    hiddenProjectCount: Math.max(0, allProjects.length - entitlements.limits.projects),
    isOwner,
  };
}

export type DirectoryCard = Pick<ProfileRow, 'id' | 'username' | 'businessName' | 'bio' | 'province' | 'city' | 'avatarKey' | 'logoKey' | 'yearsExperience'> & {
  professions: string[];
};

/** Paginated directory search. Fetches one extra row instead of running a COUNT(*). */
export async function searchDirectory(query: DirectoryQuery): Promise<{ results: DirectoryCard[]; hasMore: boolean }> {
  const db = getDb();
  const conditions = [eq(profiles.status, 'active'), eq(profiles.isPublished, true)];
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
    })
    .from(profiles)
    .where(and(...conditions))
    .orderBy(desc(profiles.updatedAt))
    .limit(DIRECTORY_PAGE_SIZE + 1)
    .offset((query.page - 1) * DIRECTORY_PAGE_SIZE);

  const page = rows.slice(0, DIRECTORY_PAGE_SIZE);
  const tags = await loadTags(page.map((r) => r.id));
  return { results: page.map((r) => ({ ...r, professions: tags.professions.get(r.id) ?? [] })), hasMore: rows.length > DIRECTORY_PAGE_SIZE };
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
  return getDb().select().from(schema.inquiries).where(and(eq(schema.inquiries.profileId, profileId), status)).orderBy(desc(schema.inquiries.createdAt)).limit(100);
}
