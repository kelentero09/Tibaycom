import type { MetadataRoute } from 'next';
import { and, desc, eq } from 'drizzle-orm';
import { PROFESSIONS } from '@/lib/professions';
import { getDb, getEnv, schema } from '@/server/db';

export const dynamic = 'force-dynamic';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = getEnv().PUBLIC_SITE_URL;
  const { profiles } = schema;
  // Sitemap protocol allows 50,000 URLs per file; split into a sitemap index if the directory outgrows this.
  const rows = await getDb()
    .select({ username: profiles.username, updatedAt: profiles.updatedAt })
    .from(profiles)
    .where(and(eq(profiles.status, 'active'), eq(profiles.isPublished, true)))
    .orderBy(desc(profiles.updatedAt))
    .limit(40_000);
  return [
    ...['', '/directory', '/pricing', '/about', '/contact', '/privacy', '/terms'].map((path) => ({ url: `${base}${path}`, changeFrequency: 'weekly' as const })),
    ...PROFESSIONS.map((p) => ({ url: `${base}/directory?profession=${p.slug}`, changeFrequency: 'daily' as const })),
    ...rows.map((row) => ({ url: `${base}/p/${row.username}`, lastModified: row.updatedAt, changeFrequency: 'weekly' as const })),
  ];
}
