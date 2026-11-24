import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { cache } from 'react';
import { MessagesSquare } from 'lucide-react';
import { PostCard } from '@/components/community/post-card';
import { BriefcaseBusiness, CalendarRange, CheckCircle2, CreditCard, EyeOff, FileText, FolderOpen, Globe, Inbox, MapPin, MessageCircle, Phone, Settings, Sparkles, Wrench } from 'lucide-react';
import { ImageUpload } from '@/components/profile/image-upload';
import { PreviewBar, PreviewToggle } from '@/components/profile/preview-bar';
import { ProfileEditor } from '@/components/profile/profile-editor';
import { ProjectEditor } from '@/components/profile/project-editor';
import { InquiryDialog, ReportDialog, ShareTools } from '@/components/profile/visitor-tools';
import { ReviewsSection } from '@/components/reviews/reviews-section';
import { RatingBadge } from '@/components/reviews/stars';
import { Button } from '@/components/ui/button';
import { Alert, Badge, EmptyState } from '@/components/ui/misc';
import { UpgradeBanner } from '@/components/upgrade-prompt';
import { INTENT_INFO, isProfessionalIntent, PROJECT_STATUS_LABELS, projectPeriod } from '@/lib/community';
import { isProfession, professionLabel } from '@/lib/professions';
import { getSession, isAdmin } from '@/server/auth';
import { getEnv } from '@/server/db';
import { getPlanConfig } from '@/server/entitlements';
import { getProfilePosts } from '@/server/community';
import { countNewInquiries, getFullProfile, getProfileByUserId } from '@/server/profiles';
import { getReviewSummary, listReviews } from '@/server/reviews';
import { imageUrl } from '@/server/storage';

type Props = { params: Promise<{ username: string }>; searchParams: Promise<{ welcome?: string; view?: string }> };

const load = cache(async (username: string, preview: boolean) => {
  const session = await getSession();
  return getFullProfile(username, session?.user.id ?? null, session ? isAdmin(session.user) : false, preview);
});

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const data = await load((await params).username, false);
  if (!data) return { title: 'Profile not found', robots: { index: false } };
  const { profile, professions } = data;
  const roles = professions.map(professionLabel).join(', ');
  const place = [profile.city, profile.province].filter(Boolean).join(', ');
  const title = `${profile.businessName} — ${roles || 'Construction professional'}${place ? ` in ${place}` : ''}`;
  const description = (profile.bio || `View projects and request a quotation from ${profile.businessName} on Tibay.`).slice(0, 160);
  const image = imageUrl(profile.coverKey ?? profile.logoKey ?? profile.avatarKey);
  const hidden = profile.status !== 'active' || !profile.isPublished;
  return {
    title,
    description,
    alternates: { canonical: `/p/${profile.username}` },
    robots: hidden ? { index: false } : undefined,
    openGraph: { title, description, type: 'profile', url: `/p/${profile.username}`, images: image ? [image] : undefined },
  };
}

function Section({ id, title, eyebrow, action, children }: { id: string; title: string; eyebrow?: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section id={id} className="grid scroll-mt-28 gap-5" aria-labelledby={`${id}-title`}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="grid gap-1">
          {eyebrow && <p className="text-xs font-semibold uppercase tracking-wider text-accent">{eyebrow}</p>}
          <h2 id={`${id}-title`} className="text-xl font-semibold tracking-tight sm:text-2xl">
            {title}
          </h2>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

const statusVariant = { planning: 'outline', ongoing: 'warning', completed: 'success' } as const;

/** Request time for relative dates (kept out of render for the purity lint rule). */
const currentTime = () => Date.now();


export default async function ProfilePage({ params, searchParams }: Props) {
  const { welcome, view } = await searchParams;
  const preview = view === 'public';
  const data = await load((await params).username, preview);
  if (!data) notFound();
  const { profile, professions, specializations, projects, entitlements, isOwner, hiddenProjectCount } = data;
  /** Owner in edit mode. In preview the owner sees the visitor page. */
  const editing = isOwner && !preview;
  const visitor = !editing;
  const env = getEnv();
  const pageUrl = `${env.PUBLIC_SITE_URL}/p/${profile.username}`;
  const place = [profile.city, profile.province].filter(Boolean).join(', ');
  const cover = imageUrl(profile.coverKey);
  const avatar = imageUrl(profile.avatarKey);
  const logo = imageUrl(profile.logoKey);
  const photoLimit = entitlements.limits.photosPerProject;
  const professional = isProfessionalIntent(profile.intent);
  const premiumLimits = editing ? (await getPlanConfig()).limits.premium : null;
  const telHref = profile.phone ? `tel:${profile.phone.replace(/[^+\d]/g, '')}` : null;
  const session = await getSession();
  const viewerId = session?.user.id ?? null;
  const [newInquiries, posts, viewerProfile, reviewSummary, reviews] = await Promise.all([
    editing ? countNewInquiries(profile.id) : 0,
    getProfilePosts(profile.id, viewerId),
    viewerId ? getProfileByUserId(viewerId) : null,
    professional ? getReviewSummary(profile.id) : null,
    professional ? listReviews(profile.id) : [],
  ]);
  const now = currentTime();
  // The community APIs need an active profile, so only then can the viewer heart or comment.
  const viewerCanInteract = !!viewerProfile && viewerProfile.status === 'active';
  const atProjectLimit = projects.length >= entitlements.limits.projects;
  const services = [...new Set([...specializations, ...profile.services])];
  const completed = projects.filter((p) => p.status === 'completed').length;
  const ongoing = projects.filter((p) => p.status === 'ongoing').length;
  const canInquire = visitor && !isOwner && professional;

  const nav = [
    { id: 'about', label: 'About', show: !!profile.bio || editing },
    { id: 'services', label: 'Services', show: professional && services.length > 0 },
    { id: 'projects', label: 'Projects', show: professional },
    { id: 'reviews', label: reviewSummary?.count ? `Reviews (${reviewSummary.count})` : 'Reviews', show: professional },
    { id: 'posts', label: 'Posts', show: posts.length > 0 || editing },
    { id: 'contact', label: 'Contact', show: true },
  ].filter((n) => n.show);

  const stats = [
    { label: 'Years of experience', value: profile.yearsExperience, icon: BriefcaseBusiness },
    { label: 'Projects completed', value: completed || null, icon: CheckCircle2 },
    { label: 'Ongoing projects', value: ongoing || null, icon: CalendarRange },
  ].filter((s) => s.value != null);

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'LocalBusiness',
    name: profile.businessName,
    description: profile.bio || undefined,
    url: pageUrl,
    image: avatar || logo ? `${env.PUBLIC_SITE_URL}${avatar ?? logo}` : undefined,
    telephone: profile.phone || undefined,
    address: place ? { '@type': 'PostalAddress', addressLocality: profile.city, addressRegion: profile.province, addressCountry: 'PH' } : undefined,
    areaServed: profile.serviceAreas.length ? profile.serviceAreas : undefined,
    aggregateRating: reviewSummary?.count ? { '@type': 'AggregateRating', ratingValue: reviewSummary.average, bestRating: 5, worstRating: 1, reviewCount: reviewSummary.count } : undefined,
  };

  return (
    <>
      {professional && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }} />}

      {isOwner && preview && <PreviewBar username={profile.username} url={pageUrl} isPublished={profile.isPublished && profile.status === 'active'} />}

      {editing && (
        <div className="border-b bg-subtle">
          <div className="container-page flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-muted-foreground">
              <span className="font-medium text-foreground">This is your page.</span> Only you can see the edit controls.{' '}
              <Badge variant={entitlements.plan === 'premium' ? 'accent' : 'outline'}>{entitlements.plan === 'premium' ? 'Premium' : 'Free plan'}</Badge>
            </p>
            <nav aria-label="Manage profile" className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 sm:pb-0">
              <ProfileEditor
                initial={{
                  intent: profile.intent,
                  businessName: profile.businessName,
                  bio: profile.bio,
                  professions,
                  specializations,
                  services: profile.services,
                  yearsExperience: profile.yearsExperience,
                  province: profile.province,
                  city: profile.city,
                  serviceAreas: profile.serviceAreas,
                  phone: profile.phone,
                  contactEmail: profile.contactEmail,
                  facebookUrl: profile.facebookUrl,
                  messengerUrl: profile.messengerUrl,
                  isPublished: profile.isPublished,
                }}
              />
              <PreviewToggle username={profile.username} />
              {professional && (
                <>
                  <Button asChild variant="outline" size="sm">
                    <Link href="/inbox">
                      <Inbox aria-hidden /> Requests
                      {newInquiries > 0 && <span className="rounded-full bg-accent px-1.5 py-0.5 text-xs font-medium leading-none text-accent-foreground">{newInquiries}</span>}
                    </Link>
                  </Button>
                  <Button asChild variant="outline" size="sm">
                    <Link href="/quotations">
                      <FileText aria-hidden /> Quotations
                    </Link>
                  </Button>
                </>
              )}
              <Button asChild variant="outline" size="sm">
                <Link href="/account/subscription">
                  <CreditCard aria-hidden /> Subscription
                </Link>
              </Button>
              <Button asChild variant="outline" size="sm">
                <Link href="/account/security">
                  <Settings aria-hidden /> Settings
                </Link>
              </Button>
            </nav>
          </div>
        </div>
      )}

      {/* Hero */}
      <header className="relative">
        <div className="relative h-48 overflow-hidden bg-gradient-to-br from-slate-900 via-slate-800 to-slate-600 sm:h-72">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {cover && <img src={cover} alt="" data-fade className="size-full object-cover" fetchPriority="high" />}
          <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/10 to-transparent" aria-hidden />
          {editing && <ImageUpload kind="cover" label="Cover photo" className="absolute bottom-3 right-3" locked={!entitlements.limits.customCoverPhoto} />}
        </div>
        <div className="container-page">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:gap-5">
              <div className="relative -mt-14 shrink-0 sm:-mt-16">
                <div className="flex size-28 items-center justify-center overflow-hidden rounded-2xl border-4 border-background bg-muted text-4xl font-semibold text-muted-foreground shadow-lift sm:size-32">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {avatar ? <img src={avatar} alt={`${profile.businessName} profile photo`} className="size-full object-cover" /> : profile.businessName[0]?.toUpperCase()}
                </div>
                {editing && <ImageUpload kind="avatar" label="Photo" maxDimension={640} className="absolute -bottom-2 left-1/2 -translate-x-1/2" />}
              </div>
              <div className="grid gap-2 pt-1 sm:pb-1 sm:pt-5">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={profile.intent === 'seeking_work' || profile.intent === 'hiring' ? 'success' : 'accent'}>{INTENT_INFO[profile.intent].badge}</Badge>
                  {entitlements.plan === 'premium' && (
                    <Badge variant="warning">
                      <Sparkles className="size-3" aria-hidden /> Premium
                    </Badge>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{profile.businessName}</h1>
                  {reviewSummary && reviewSummary.count > 0 && (
                    <a href="#reviews" className="rounded-md px-1 hover:bg-muted">
                      <RatingBadge average={reviewSummary.average} count={reviewSummary.count} className="text-base" />
                    </a>
                  )}
                </div>
                {professions.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {professions.map((slug) => (
                      <Link key={slug} href={isProfession(slug) ? `/directory?profession=${slug}` : `/directory?q=${encodeURIComponent(slug)}`}>
                        <Badge variant="outline" className="text-foreground">
                          {professionLabel(slug)}
                        </Badge>
                      </Link>
                    ))}
                  </div>
                )}
                {place && (
                  <p className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
                    <MapPin className="size-4" aria-hidden /> {place}
                  </p>
                )}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 sm:pb-1">
              {logo && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={logo} alt={`${profile.businessName} logo`} className="h-11 max-w-28 rounded-md border bg-white object-contain p-1" />
              )}
              {editing && <ImageUpload kind="logo" label={logo ? 'Change logo' : 'Logo'} maxDimension={640} />}
              <div className="hidden gap-2 sm:flex">
                <ShareTools url={pageUrl} businessName={profile.businessName} />
                {canInquire && <InquiryDialog username={profile.username} businessName={profile.businessName} siteKey={env.TURNSTILE_SITE_KEY} size="md" />}
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Section navigation, like a company website */}
      {nav.length > 2 && (
        <nav aria-label="Page sections" className="sticky top-14 z-20 mt-6 border-y bg-background/90 backdrop-blur">
          <ul className="container-page flex gap-1 overflow-x-auto py-1.5 text-sm">
            {nav.map((n) => (
              <li key={n.id}>
                <a href={`#${n.id}`} className="inline-flex min-h-10 items-center whitespace-nowrap rounded-md px-3 font-medium text-muted-foreground hover:bg-muted hover:text-foreground">
                  {n.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      )}

      <div className={`container-page grid gap-12 pb-10 pt-8 ${canInquire ? 'max-sm:pb-28' : ''}`}>
        {editing && welcome && <Alert variant="success">Your page is live. Add a photo, a short description and your first project so people can see your work.</Alert>}
        {editing && !profile.isPublished && (
          <Alert variant="warning">
            <EyeOff className="mr-1.5 inline size-4" aria-hidden /> Your page is hidden. Turn on “Show my profile publicly” in Edit profile to appear in the directory.
          </Alert>
        )}
        {profile.status === 'suspended' && <Alert variant="destructive">This profile has been suspended by Tibay and is not visible to the public.</Alert>}

        {stats.length > 0 && professional && (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {stats.map(({ label, value, icon: Icon }) => (
              <li key={label} className="grid gap-1 rounded-xl border bg-background p-4 shadow-card">
                <Icon className="size-5 text-accent" aria-hidden />
                <span className="text-2xl font-semibold tracking-tight">{value}</span>
                <span className="text-xs text-muted-foreground">{label}</span>
              </li>
            ))}
          </ul>
        )}

        {(profile.bio || editing) && (
          <Section id="about" eyebrow="About" title={professional ? `About ${profile.businessName}` : 'About me'}>
            {profile.bio ? (
              <p className="max-w-3xl whitespace-pre-line text-base leading-relaxed text-foreground/90">{profile.bio}</p>
            ) : (
              <p className="text-sm text-muted-foreground">Tell people about yourself and your work — tap “Edit profile”.</p>
            )}
          </Section>
        )}

        {professional && services.length > 0 && (
          <Section id="services" eyebrow="What we do" title="Services">
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {services.map((service) => (
                <li key={service} className="flex items-center gap-3 rounded-xl border bg-background p-4 shadow-card">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent">
                    <Wrench className="size-4" aria-hidden />
                  </span>
                  <span className="font-medium">{service}</span>
                </li>
              ))}
            </ul>
          </Section>
        )}

        {professional && (
          <Section
            id="projects"
            eyebrow="Portfolio"
            title={`Projects${projects.length ? ` (${projects.length})` : ''}`}
            action={editing ? <ProjectEditor canAddProject={!atProjectLimit} photoLimit={photoLimit} /> : undefined}
          >
            {editing && hiddenProjectCount > 0 ? (
              <UpgradeBanner
                title={`${hiddenProjectCount} project${hiddenProjectCount === 1 ? ' is' : 's are'} hidden from visitors.`}
                body={`Your plan shows ${entitlements.limits.projects} projects publicly. Nothing was deleted — renew Premium to show them all again.`}
                cta="Show all my projects"
              />
            ) : editing && entitlements.plan === 'free' && atProjectLimit ? (
              <UpgradeBanner
                title={`You’ve used all ${entitlements.limits.projects} project slots.`}
                body={`Clients choose builders who show more finished work. Premium shows up to ${premiumLimits?.projects ?? 50} projects with ${premiumLimits?.photosPerProject ?? 10} photos each.`}
                cta="Add more projects"
              />
            ) : null}
            {projects.length === 0 ? (
              <EmptyState icon={<FolderOpen />} title="No projects yet" description={editing ? 'Add your first project with photos — profiles with projects get far more inquiries.' : 'No projects have been added yet.'} />
            ) : (
              <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {projects.map((project) => {
                  const coverPhoto = imageUrl(project.photos[0]?.key ?? null);
                  const period = projectPeriod(project);
                  const href = `/p/${profile.username}/projects/${project.id}${preview ? '?view=public' : ''}`;
                  return (
                    <li key={project.id} className="group relative grid overflow-hidden rounded-xl border bg-background shadow-card transition-shadow hover:shadow-lift">
                      <Link href={href} className="grid">
                        <div className="relative aspect-[4/3] bg-muted">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          {coverPhoto ? <img src={coverPhoto} alt="" loading="lazy" decoding="async" data-fade className="size-full object-cover transition-transform duration-300 group-hover:scale-[1.03]" /> : <FolderOpen className="absolute left-1/2 top-1/2 size-8 -translate-x-1/2 -translate-y-1/2 text-muted-foreground" aria-hidden />}
                          <Badge variant={statusVariant[project.status]} className="absolute left-3 top-3 bg-background/95 shadow-card">
                            {PROJECT_STATUS_LABELS[project.status]}
                          </Badge>
                          {project.photos.length > 1 && <span className="absolute bottom-3 right-3 rounded-full bg-black/60 px-2 py-0.5 text-xs text-white">{project.photos.length} photos</span>}
                        </div>
                        <div className="grid gap-1 p-4">
                          <h3 className="font-semibold group-hover:underline">{project.title}</h3>
                          <p className="text-sm text-muted-foreground">{[project.location, period].filter(Boolean).join(' · ') || ' '}</p>
                          {project.description && <p className="line-clamp-2 text-sm text-foreground/80">{project.description}</p>}
                        </div>
                      </Link>
                      {editing && (
                        <div className="absolute right-3 top-3">
                          <ProjectEditor
                            photoLimit={photoLimit}
                            project={{
                              id: project.id,
                              title: project.title,
                              description: project.description,
                              location: project.location,
                              year: project.year,
                              status: project.status,
                              startDate: project.startDate,
                              endDate: project.endDate,
                              photos: project.photos.map((p) => ({ id: p.id, url: imageUrl(p.key)! })),
                            }}
                          />
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </Section>
        )}

        {professional && reviewSummary && (
          <Section id="reviews" eyebrow="What clients say" title="Reviews">
            <ReviewsSection
              username={profile.username}
              businessName={profile.businessName}
              summary={reviewSummary}
              reviews={reviews}
              viewer={{ userId: viewerId, isOwner, preview }}
              now={now}
            />
          </Section>
        )}

        {(posts.length > 0 || editing) && (
          <Section
            id="posts"
            eyebrow="Community"
            title="Latest posts"
            action={
              <Button asChild variant="outline" size="sm">
                <Link href="/community">{editing ? 'Write a post' : 'Open community'}</Link>
              </Button>
            }
          >
            {posts.length === 0 ? (
              <EmptyState icon={<MessagesSquare />} title="No posts yet" description="Share site updates, finished work or what you are looking for in the community — your posts appear here." />
            ) : (
              <ul className="grid gap-4 lg:grid-cols-2">
                {posts.map((post) => (
                  <li key={post.id}>
                    <PostCard post={post} viewer={{ signedIn: viewerCanInteract && !preview, isAuthor: editing && post.authorUserId === viewerId }} />
                  </li>
                ))}
              </ul>
            )}
          </Section>
        )}

        <Section id="contact" eyebrow="Get in touch" title="Contact">
          <div className="grid gap-4">
            <div className="grid content-start gap-4 rounded-xl border bg-background p-5 shadow-card">
              {canInquire && (
                <div className="grid gap-2">
                  <p className="text-sm text-muted-foreground">Planning a build or renovation? Send a request and {profile.businessName} will get back to you with a quotation.</p>
                  <div className="hidden sm:block">
                    <InquiryDialog username={profile.username} businessName={profile.businessName} siteKey={env.TURNSTILE_SITE_KEY} />
                  </div>
                </div>
              )}
              <ul className="grid gap-1 text-sm sm:grid-cols-2">
                {telHref && (
                  <li>
                    <a href={telHref} className="flex min-h-11 items-center gap-2.5 rounded-md px-2 hover:bg-muted">
                      <Phone className="size-4 text-muted-foreground" aria-hidden /> {profile.phone}
                    </a>
                  </li>
                )}
                {profile.messengerUrl && (
                  <li>
                    <a href={profile.messengerUrl} target="_blank" rel="noopener noreferrer nofollow" className="flex min-h-11 items-center gap-2.5 rounded-md px-2 hover:bg-muted">
                      <MessageCircle className="size-4 text-muted-foreground" aria-hidden /> Message on Messenger
                    </a>
                  </li>
                )}
                {profile.facebookUrl && (
                  <li>
                    <a href={profile.facebookUrl} target="_blank" rel="noopener noreferrer nofollow" className="flex min-h-11 items-center gap-2.5 rounded-md px-2 hover:bg-muted">
                      <Globe className="size-4 text-muted-foreground" aria-hidden /> Facebook page
                    </a>
                  </li>
                )}
                {!telHref && !profile.messengerUrl && !profile.facebookUrl && (
                  <li className="px-2 text-muted-foreground">{editing ? 'Add your phone, Messenger and Facebook in Edit profile.' : 'No public contact details yet.'}</li>
                )}
              </ul>
              <div className="sm:hidden">
                <ShareTools url={pageUrl} businessName={profile.businessName} />
              </div>
            </div>
          </div>
          {visitor && !isOwner && <ReportDialog username={profile.username} siteKey={env.TURNSTILE_SITE_KEY} />}
        </Section>

        {canInquire && (
          <div className="fixed inset-x-0 bottom-0 z-30 flex gap-2 border-t bg-background/95 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur sm:hidden" data-no-print>
            {telHref && (
              <Button asChild variant="outline" size="lg" className="shrink-0">
                <a href={telHref} aria-label={`Call ${profile.businessName}`}>
                  <Phone aria-hidden /> Call
                </a>
              </Button>
            )}
            <div className="flex-1 [&>button]:w-full">
              <InquiryDialog username={profile.username} businessName={profile.businessName} siteKey={env.TURNSTILE_SITE_KEY} />
            </div>
          </div>
        )}

        {!entitlements.limits.removePlatformBranding && (
          <p className="border-t pt-6 text-center text-sm text-muted-foreground">
            Made with{' '}
            <Link href="/" className="font-medium text-foreground underline-offset-4 hover:underline">
              Tibay
            </Link>{' '}
            — create your own free builder page.
          </p>
        )}
      </div>
    </>
  );
}
