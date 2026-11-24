import Link from 'next/link';
import { ArrowRight, Eye, FileText, Inbox, MessageSquareText, MessagesSquare, PenLine, Search, UserRoundPlus } from 'lucide-react';
import { PostCard } from '@/components/community/post-card';
import { ProfessionalCard } from '@/components/professional-card';
import { RatingBadge } from '@/components/reviews/stars';
import { Button } from '@/components/ui/button';
import { Badge, EmptyState } from '@/components/ui/misc';
import { isProfessionalIntent } from '@/lib/community';
import { PROFESSIONS } from '@/lib/professions';
import { feedQuerySchema } from '@/lib/validation';
import { getFeed } from '@/server/community';
import { getEntitlements } from '@/server/entitlements';
import { countUnreadSentRequests } from '@/server/inquiries';
import { countNewInquiries, getProfileByUserId, searchDirectory } from '@/server/profiles';
import { getReviewSummary } from '@/server/reviews';
import { imageUrl } from '@/server/storage';

const FEED_SIZE = 8;
const quickProfessions = ['general-contractor', 'architect', 'civil-engineer', 'electrician', 'plumber', 'carpenter'];

const greeting = () => {
  const hour = Number(new Intl.DateTimeFormat('en-PH', { timeZone: 'Asia/Manila', hour: 'numeric', hourCycle: 'h23' }).format(new Date()));
  return hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
};

/** The home page for signed-in members: their shortcuts, the latest community posts and professionals nearby. */
export async function MemberHome({ user }: { user: { id: string; name: string } }) {
  const profile = await getProfileByUserId(user.id);
  const active = profile?.status === 'active';
  const professional = !!profile && isProfessionalIntent(profile.intent);
  const [feed, nearby, newInquiries, unreadReplies, entitlements, summary] = await Promise.all([
    getFeed(feedQuerySchema.parse({}), user.id),
    searchDirectory({ page: 1, province: profile?.province || undefined }),
    professional ? countNewInquiries(profile.id) : 0,
    countUnreadSentRequests(user.id),
    profile ? getEntitlements(user.id) : null,
    professional ? getReviewSummary(profile.id) : null,
  ]);
  // Fall back to everyone when nobody else is listed in the member's province yet.
  const pros = (nearby.results.length > 1 ? nearby.results : (await searchDirectory({ page: 1 })).results).filter((p) => p.id !== profile?.id).slice(0, 4);
  const posts = [...feed.featured, ...feed.posts].slice(0, FEED_SIZE);
  const firstName = (profile && !professional ? profile.businessName : user.name).trim().split(/\s+/)[0] || 'there';
  const avatar = imageUrl(profile?.avatarKey ?? null);

  const actions: { href: string; label: string; icon: typeof Inbox; count?: number }[] = professional
    ? [
        { href: `/p/${profile.username}`, label: 'My page', icon: Eye },
        { href: '/inbox', label: 'Requests', icon: Inbox, count: newInquiries },
        { href: '/quotations/new', label: 'New quotation', icon: FileText },
        { href: '/community', label: 'Write a post', icon: PenLine },
      ]
    : [
        { href: '/directory', label: 'Find a professional', icon: Search },
        { href: '/account/requests', label: 'My requests', icon: MessageSquareText, count: unreadReplies },
        { href: '/community', label: 'Write a post', icon: PenLine },
        ...(profile ? [{ href: `/p/${profile.username}`, label: 'My page', icon: Eye }] : []),
      ];

  return (
    <div className="container-page grid gap-8 py-8">
      <section className="grid gap-4 rounded-2xl border bg-subtle p-5 sm:p-7" aria-labelledby="welcome-title">
        <div className="grid gap-1">
          <h1 id="welcome-title" className="text-2xl font-semibold tracking-tight sm:text-3xl">
            {greeting()}, {firstName}!
          </h1>
          <p className="text-muted-foreground">Here is what is happening in the Tibay community today.</p>
        </div>
        <nav aria-label="Shortcuts" className="flex flex-wrap gap-2">
          {actions.map(({ href, label, icon: Icon, count }) => (
            <Button key={href + label} asChild variant="outline" className="bg-background">
              <Link href={href}>
                <Icon aria-hidden /> {label}
                {!!count && <span className="rounded-full bg-accent px-1.5 py-0.5 text-xs font-medium leading-none text-accent-foreground">{count}</span>}
              </Link>
            </Button>
          ))}
        </nav>
      </section>

      {!profile && (
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border-2 border-dashed border-accent/40 bg-background p-5">
          <div className="flex items-start gap-3">
            <UserRoundPlus className="mt-0.5 size-6 shrink-0 text-accent" aria-hidden />
            <div className="grid gap-0.5">
              <p className="font-semibold">Finish setting up your account</p>
              <p className="text-sm text-muted-foreground">Create your page to post, heart, comment and get found — it takes about two minutes.</p>
            </div>
          </div>
          <Button asChild variant="accent">
            <Link href="/onboarding">
              Create my page <ArrowRight aria-hidden />
            </Link>
          </Button>
        </div>
      )}

      <div className="grid gap-8 lg:grid-cols-[1fr_22rem]">
        <section className="grid content-start gap-4" aria-labelledby="feed-title">
          <div className="flex items-end justify-between gap-3">
            <h2 id="feed-title" className="text-xl font-semibold">
              From the community
            </h2>
            <Link href="/community" className="text-sm font-medium text-accent underline-offset-4 hover:underline">
              Open community →
            </Link>
          </div>
          {posts.length === 0 ? (
            <EmptyState
              icon={<MessagesSquare />}
              title="No posts yet"
              description="Be the first to share a site update or a finished project."
              action={
                <Button asChild>
                  <Link href="/community">Write the first post</Link>
                </Button>
              }
            />
          ) : (
            <ul className="grid gap-4">
              {posts.map((post) => (
                <li key={post.id}>
                  <PostCard post={post} viewer={{ signedIn: active, isAuthor: post.authorUserId === user.id }} />
                </li>
              ))}
            </ul>
          )}
          {posts.length > 0 && (
            <Button asChild variant="outline" className="justify-self-center">
              <Link href="/community">See more posts</Link>
            </Button>
          )}
        </section>

        <aside className="grid content-start gap-6">
          {profile && (
            <section className="grid gap-3 rounded-xl border bg-background p-4 shadow-card" aria-label="Your page">
              <div className="flex items-center gap-3">
                <div className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted font-semibold text-muted-foreground">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {avatar ? <img src={avatar} alt="" className="size-full object-cover" /> : profile.businessName[0]?.toUpperCase()}
                </div>
                <div className="grid min-w-0">
                  <p className="truncate font-semibold">{profile.businessName}</p>
                  <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <Badge variant={entitlements?.plan === 'premium' ? 'accent' : 'outline'}>{entitlements?.plan === 'premium' ? 'Premium' : 'Free plan'}</Badge>
                    {summary && summary.count > 0 ? <RatingBadge average={summary.average} count={summary.count} /> : professional ? <span>No reviews yet</span> : null}
                  </p>
                </div>
              </div>
              {!profile.isPublished && <p className="text-xs text-warning">Your page is hidden from the public.</p>}
              <div className="flex flex-wrap gap-2">
                <Button asChild size="sm">
                  <Link href={`/p/${profile.username}`}>Edit my page</Link>
                </Button>
                <Button asChild size="sm" variant="outline">
                  <Link href={`/p/${profile.username}?view=public`}>Preview</Link>
                </Button>
                {entitlements?.plan !== 'premium' && (
                  <Button asChild size="sm" variant="ghost">
                    <Link href="/pricing">Go Premium</Link>
                  </Button>
                )}
              </div>
            </section>
          )}

          <section className="grid gap-3" aria-labelledby="nearby-title">
            <div className="flex items-end justify-between gap-3">
              <h2 id="nearby-title" className="font-semibold">
                {profile?.province && nearby.results.length > 1 ? `Professionals in ${profile.province}` : 'Professionals on Tibay'}
              </h2>
              <Link href={profile?.province ? `/directory?province=${encodeURIComponent(profile.province)}` : '/directory'} className="text-sm font-medium text-accent underline-offset-4 hover:underline">
                See all →
              </Link>
            </div>
            {pros.length === 0 ? (
              <p className="text-sm text-muted-foreground">No professionals listed yet.</p>
            ) : (
              <ul className="grid gap-3">
                {pros.map((pro) => (
                  <li key={pro.id}>
                    <ProfessionalCard pro={pro} />
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="grid gap-3" aria-labelledby="browse-title">
            <h2 id="browse-title" className="font-semibold">
              Browse by profession
            </h2>
            <ul className="flex flex-wrap gap-2">
              {quickProfessions.map((slug) => (
                <li key={slug}>
                  <Link href={`/directory?profession=${slug}`} className="inline-flex min-h-9 items-center rounded-full border bg-background px-3 text-sm hover:border-foreground/40">
                    {PROFESSIONS.find((p) => p.slug === slug)?.label}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        </aside>
      </div>
    </div>
  );
}
