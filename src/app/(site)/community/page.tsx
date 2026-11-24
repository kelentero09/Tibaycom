import type { Metadata } from 'next';
import Link from 'next/link';
import { asc, eq } from 'drizzle-orm';
import { MessagesSquare } from 'lucide-react';
import { PostCard } from '@/components/community/post-card';
import { PostComposer } from '@/components/community/post-composer';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/form';
import { EmptyState } from '@/components/ui/misc';
import { POST_KIND_LABELS, POST_KIND_VALUES } from '@/lib/community';
import { cn } from '@/lib/utils';
import { feedQuerySchema, PROVINCES } from '@/lib/validation';
import { getSession } from '@/server/auth';
import { getFeed, postsUsedToday } from '@/server/community';
import { getDb, schema } from '@/server/db';
import { getEntitlements } from '@/server/entitlements';
import { getProfileByUserId } from '@/server/profiles';
import { imageUrl } from '@/server/storage';

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

const parse = async (searchParams: Props['searchParams']) => {
  const raw = await searchParams;
  return feedQuerySchema.parse(Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v])));
};

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const query = await parse(searchParams);
  const what = query.kind ? POST_KIND_LABELS[query.kind] : 'Community';
  return {
    title: `${what}${query.province ? ` in ${query.province}` : ''} — Tibay community`,
    description: 'Updates, finished projects, hiring posts and job seekers from builders, contractors and workers across the Philippines.',
    alternates: { canonical: '/community' },
    robots: query.before || query.kind || query.province ? { index: false, follow: true } : undefined,
  };
}

export default async function CommunityPage({ searchParams }: Props) {
  const query = await parse(searchParams);
  const session = await getSession();
  const viewerId = session?.user.id ?? null;
  const [feed, profile] = await Promise.all([getFeed(query, viewerId), viewerId ? getProfileByUserId(viewerId) : null]);

  let composer: React.ReactNode = null;
  if (profile && profile.status === 'active') {
    const [entitlements, projects, usage] = await Promise.all([
      getEntitlements(profile.userId),
      getDb().select({ id: schema.projects.id, title: schema.projects.title }).from(schema.projects).where(eq(schema.projects.profileId, profile.id)).orderBy(asc(schema.projects.createdAt)),
      postsUsedToday(profile.userId),
    ]);
    const limit = entitlements.limits.postsPerDay;
    const left = limit === null ? null : Math.max(0, limit - usage);
    composer = (
      <PostComposer
        author={{ businessName: profile.businessName, avatarUrl: imageUrl(profile.avatarKey), intent: profile.intent }}
        projects={projects}
        quotaNote={left === null ? null : `${left} of ${limit} posts left today`}
      />
    );
  }

  const href = (params: { kind?: string; province?: string; before?: number }) => {
    const search = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== undefined && v !== '') as [string, string][]);
    return `/community${search.size ? `?${search}` : ''}`;
  };
  const tab = 'shrink-0 rounded-full border px-3 py-1.5 text-sm';

  return (
    <div className="container-page grid max-w-3xl gap-6 py-8">
      <div className="grid gap-1">
        <h1 className="text-2xl font-semibold sm:text-3xl">Community</h1>
        <p className="text-muted-foreground">Updates from site, finished projects, crews hiring and people looking for work, from builders across the Philippines.</p>
      </div>

      {composer ??
        (session ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-background p-4 shadow-card">
            <p className="text-sm text-muted-foreground">Create your profile to post, heart and comment.</p>
            <Button asChild size="sm">
              <Link href="/onboarding">Create my profile</Link>
            </Button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-background p-4 shadow-card">
            <p className="text-sm text-muted-foreground">Join free to post updates, heart and comment.</p>
            <div className="flex gap-2">
              <Button asChild variant="outline" size="sm">
                <Link href="/login?next=/community">Log in to post</Link>
              </Button>
              <Button asChild size="sm">
                <Link href="/register">Join free</Link>
              </Button>
            </div>
          </div>
        ))}

      <div className="grid gap-3">
        <nav aria-label="Filter by type" className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
          <Link href={href({ province: query.province })} aria-current={!query.kind ? 'page' : undefined} className={cn(tab, !query.kind ? 'border-primary bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted')}>
            All
          </Link>
          {POST_KIND_VALUES.map((kind) => (
            <Link
              key={kind}
              href={href({ kind, province: query.province })}
              aria-current={query.kind === kind ? 'page' : undefined}
              className={cn(tab, query.kind === kind ? 'border-primary bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted')}
            >
              {POST_KIND_LABELS[kind]}
            </Link>
          ))}
        </nav>
        <form action="/community" className="flex items-center gap-2">
          {query.kind && <input type="hidden" name="kind" value={query.kind} />}
          <label htmlFor="feed-province" className="sr-only">
            Province
          </label>
          <Select id="feed-province" name="province" defaultValue={query.province ?? ''} className="max-w-64">
            <option value="">All provinces</option>
            {PROVINCES.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </Select>
          <Button type="submit" variant="outline" size="sm">
            Apply
          </Button>
        </form>
      </div>

      {feed.posts.length === 0 && feed.featured.length === 0 ? (
        <EmptyState
          icon={<MessagesSquare />}
          title="No posts here yet"
          description={query.kind || query.province ? 'Try another filter, or be the first to post.' : 'Be the first to share an update with the community.'}
          action={
            query.kind || query.province || query.before ? (
              <Button asChild variant="outline">
                <Link href="/community">See all posts</Link>
              </Button>
            ) : undefined
          }
        />
      ) : (
        <ul className="grid gap-4">
          {[...feed.featured, ...feed.posts].map((post) => (
            <li key={post.id}>
              <PostCard post={post} viewer={{ signedIn: !!profile, isAuthor: post.authorUserId === viewerId }} />
            </li>
          ))}
        </ul>
      )}

      {feed.nextBefore && (
        <Button asChild variant="outline" className="justify-self-center">
          <Link href={href({ kind: query.kind, province: query.province, before: feed.nextBefore })}>Load more</Link>
        </Button>
      )}
    </div>
  );
}

