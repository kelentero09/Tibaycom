import Link from 'next/link';
import { ArrowRight, Check, FileText, Images, QrCode, Search } from 'lucide-react';
import { PostCard } from '@/components/community/post-card';
import { MemberHome } from '@/components/home/member-home';
import { PricingTable } from '@/components/pricing-table';
import { ProfessionalCard } from '@/components/professional-card';
import { Button } from '@/components/ui/button';
import { PROFESSIONS } from '@/lib/professions';
import { feedQuerySchema } from '@/lib/validation';
import { getSession } from '@/server/auth';
import { getFeed } from '@/server/community';
import { getPlanConfig } from '@/server/entitlements';
import { getT } from '@/server/locale';
import { getEnv } from '@/server/db';
import { getMemberAvatars, searchDirectory } from '@/server/profiles';
import { getCommunityStats } from '@/server/reviews';
import { imageUrl } from '@/server/storage';

const featureIcons = [Images, FileText, Search, QrCode];
/**
 * Member count for the hero. Local/demo environments show a placeholder "10,000+"; in production it is always the
 * real total (rounded down, e.g. "120+"), and is left out until it reaches SOCIAL_PROOF_MIN.
 */
const DEMO_MEMBER_COUNT = 10_000;
const SOCIAL_PROOF_MIN = 20;
const roundDown = (n: number) => (n >= 1000 ? Math.floor(n / 100) * 100 : n >= 100 ? Math.floor(n / 10) * 10 : n);
const memberLabel = (n: number) => `${roundDown(n).toLocaleString('en-PH')}${n >= DEMO_MEMBER_COUNT || n > roundDown(n) ? '+' : ''} members`;

const featuredProfessions = ['general-contractor', 'architect', 'civil-engineer', 'electrician', 'plumber', 'carpenter', 'painter', 'welder'];

export default async function HomePage() {
  const session = await getSession();
  // Members get their own home: shortcuts, the community feed and professionals nearby.
  if (session) return <MemberHome user={{ id: session.user.id, name: session.user.name }} />;
  const [config, latest, t, stats, faces, feed] = await Promise.all([getPlanConfig(), searchDirectory({ page: 1 }), getT(), getCommunityStats(), getMemberAvatars(5), getFeed(feedQuerySchema.parse({}), null)]);
  const posts = [...feed.featured, ...feed.posts].slice(0, 6);
  const joinHref = '/register';
  const members = getEnv().APP_ENV === 'production' ? stats.members : DEMO_MEMBER_COUNT;
  const membersText = members >= SOCIAL_PROOF_MIN ? `Joined by ${memberLabel(members)} and growing` : 'Join builders across the Philippines';
  return (
    <>
      <section className="relative overflow-hidden border-b bg-subtle">
        <div className="bg-blueprint pointer-events-none absolute inset-0" aria-hidden />
        <div className="container-page relative grid gap-7 py-16 sm:py-24">
          <p className="stagger inline-flex w-fit items-center gap-2 rounded-full border bg-background px-3 py-1 text-xs font-medium text-muted-foreground shadow-card" style={{ '--i': 0 } as React.CSSProperties}>
            <span className="size-1.5 rounded-full bg-accent" aria-hidden />
            {t.home.badge}
          </p>
          <h1 className="stagger max-w-3xl text-4xl font-semibold leading-[1.08] sm:text-6xl" style={{ '--i': 1 } as React.CSSProperties}>
            {t.home.title}
          </h1>
          <p className="stagger max-w-xl text-lg leading-relaxed text-muted-foreground" style={{ '--i': 2 } as React.CSSProperties}>
            {t.home.subtitle}
          </p>
          <div className="stagger flex flex-col gap-3 sm:flex-row" style={{ '--i': 3 } as React.CSSProperties}>
            <Button asChild size="lg" variant="accent" className="group">
              <Link href={joinHref}>
                {t.home.ctaPrimary} <ArrowRight className="transition-transform group-hover:translate-x-0.5" aria-hidden />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="/directory">{t.home.ctaSecondary}</Link>
            </Button>
          </div>
          <ul className="stagger flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted-foreground" style={{ '--i': 4 } as React.CSSProperties}>
            {t.home.trust.map((item) => (
              <li key={item} className="inline-flex items-center gap-1.5">
                <Check className="size-4 text-success" aria-hidden /> {item}
              </li>
            ))}
          </ul>
          <div className="stagger flex flex-wrap items-center gap-3" style={{ '--i': 5 } as React.CSSProperties}>
            {faces.length > 0 && (
              <ul className="flex -space-x-2.5" aria-hidden>
                {faces.map((f) => (
                  <li key={f.username} className="size-9 overflow-hidden rounded-full border-2 border-background bg-muted shadow-card">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={imageUrl(f.avatarKey)!} alt="" loading="lazy" decoding="async" className="size-full object-cover" />
                  </li>
                ))}
              </ul>
            )}
            <p className="text-sm font-medium">{membersText}</p>
          </div>
          <p className="stagger text-sm text-muted-foreground" style={{ '--i': 6 } as React.CSSProperties}>
            Already a member?{' '}
            <Link href="/login" className="font-medium text-accent underline-offset-4 hover:underline">
              Log in
            </Link>
          </p>
        </div>
      </section>

      <section className="container-page grid gap-8 py-16" aria-labelledby="features-heading">
        <h2 id="features-heading" className="text-2xl font-semibold sm:text-3xl">
          {t.home.featuresTitle}
        </h2>
        <ul className="grid gap-4 sm:grid-cols-2">
          {t.home.features.map((feature, index) => {
            const Icon = featureIcons[index] ?? Images;
            return (
              <li key={feature.title} className="grid gap-3 rounded-xl border bg-background p-6 shadow-card">
                <span className="flex size-10 items-center justify-center rounded-lg bg-accent-soft text-accent">
                  <Icon className="size-5" aria-hidden />
                </span>
                <h3 className="text-lg font-semibold">{feature.title}</h3>
                <p className="text-sm leading-relaxed text-muted-foreground">{feature.body}</p>
              </li>
            );
          })}
        </ul>
      </section>

      {posts.length > 0 && (
        <section className="border-t bg-subtle" aria-labelledby="community-heading">
          <div className="container-page grid gap-6 py-16">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div className="grid gap-1.5">
                <h2 id="community-heading" className="text-2xl font-semibold sm:text-3xl">
                  Latest from the community
                </h2>
                <p className="text-muted-foreground">Site updates, finished projects, crews hiring and people looking for work — happening now on Tibay.</p>
              </div>
              <Link href="/community" className="shrink-0 text-sm font-medium text-accent underline-offset-4 hover:underline">
                See all posts →
              </Link>
            </div>
            <ul className="grid items-start gap-4 lg:grid-cols-2">
              {posts.map((post) => (
                <li key={post.id}>
                  {/* Visitors can read everything; hearting or commenting sends them to log in first. */}
                  <PostCard post={post} viewer={{ signedIn: false, isAuthor: false }} />
                </li>
              ))}
            </ul>
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-background p-4 shadow-card">
              <p className="text-sm text-muted-foreground">Join free to post updates, heart and comment.</p>
              <div className="flex gap-2">
                <Button asChild variant="outline" size="sm">
                  <Link href="/login?next=/community">Log in</Link>
                </Button>
                <Button asChild size="sm" variant="accent">
                  <Link href={joinHref}>Join free</Link>
                </Button>
              </div>
            </div>
          </div>
        </section>
      )}

      <section className="border-y bg-primary text-primary-foreground" aria-labelledby="steps-heading">
        <div className="container-page grid gap-8 py-16">
          <h2 id="steps-heading" className="text-2xl font-semibold sm:text-3xl">
            {t.home.stepsTitle}
          </h2>
          <ol className="grid gap-6 sm:grid-cols-3">
            {t.home.steps.map((step, index) => (
              <li key={step.title} className="grid content-start gap-2 border-t border-white/15 pt-5">
                <span className="text-sm font-medium text-white/60">0{index + 1}</span>
                <h3 className="text-lg font-semibold">{step.title}</h3>
                <p className="text-sm leading-relaxed text-white/70">{step.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="border-b bg-subtle" aria-labelledby="browse-heading">
        <div className="container-page grid gap-6 py-16">
          <div className="flex items-end justify-between gap-4">
            <h2 id="browse-heading" className="text-2xl font-semibold sm:text-3xl">
              {t.home.browseTitle}
            </h2>
            <Link href="/directory" className="hidden shrink-0 text-sm font-medium text-accent underline-offset-4 hover:underline sm:block">
              {t.home.browseAll} →
            </Link>
          </div>
          <ul className="flex flex-wrap gap-2">
            {featuredProfessions.map((slug) => (
              <li key={slug}>
                <Link href={`/directory?profession=${slug}`} className="inline-flex min-h-10 items-center rounded-full border bg-background px-4 text-sm shadow-card hover:border-foreground/40 hover:shadow-lift">
                  {PROFESSIONS.find((p) => p.slug === slug)?.label}
                </Link>
              </li>
            ))}
          </ul>
          {latest.results.length > 0 && (
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {latest.results.slice(0, 6).map((pro) => (
                <li key={pro.id}>
                  <ProfessionalCard pro={pro} />
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section className="container-page grid gap-8 py-16" aria-labelledby="pricing-heading">
        <div className="grid gap-1.5">
          <h2 id="pricing-heading" className="text-2xl font-semibold sm:text-3xl">
            {t.home.pricingTitle}
          </h2>
          <p className="text-muted-foreground">{t.home.pricingSubtitle}</p>
        </div>
        <PricingTable config={config} freeHref={joinHref} premiumHref="/pricing" labels={t.pricing} compact />
        <Link href="/pricing" className="w-fit text-sm font-medium text-accent underline-offset-4 hover:underline">
          {t.home.compare} →
        </Link>
      </section>

      <section className="container-page pb-4">
        <div className="relative grid gap-5 overflow-hidden rounded-2xl bg-primary px-6 py-12 text-primary-foreground sm:px-12">
          <h2 className="max-w-xl text-2xl font-semibold sm:text-3xl">{t.home.finalTitle}</h2>
          <p className="text-white/70">{t.home.finalBody}</p>
          <Button asChild size="lg" variant="accent" className="w-fit">
            <Link href={joinHref}>
              {t.home.ctaPrimary} <ArrowRight aria-hidden />
            </Link>
          </Button>
        </div>
      </section>
    </>
  );
}
