import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { cache } from 'react';
import { BriefcaseBusiness, CreditCard, EyeOff, FileText, Globe, FolderOpen, MapPin, MessageCircle, Phone, Settings } from 'lucide-react';
import { ImageUpload } from '@/components/profile/image-upload';
import { ProfileEditor } from '@/components/profile/profile-editor';
import { ProjectEditor } from '@/components/profile/project-editor';
import { InquiryDialog, ReportDialog, ShareTools } from '@/components/profile/visitor-tools';
import { Button } from '@/components/ui/button';
import { Alert, Badge, EmptyState } from '@/components/ui/misc';
import { professionLabel } from '@/lib/professions';
import { getSession, isAdmin } from '@/server/auth';
import { getEnv } from '@/server/db';
import { getFullProfile } from '@/server/profiles';
import { imageUrl } from '@/server/storage';

type Props = { params: Promise<{ username: string }>; searchParams: Promise<{ welcome?: string }> };

const load = cache(async (username: string) => {
  const session = await getSession();
  return getFullProfile(username, session?.user.id ?? null, session ? isAdmin(session.user) : false);
});

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const data = await load((await params).username);
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

function Section({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="grid gap-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

export default async function ProfilePage({ params, searchParams }: Props) {
  const data = await load((await params).username);
  if (!data) notFound();
  const { profile, professions, specializations, projects, entitlements, isOwner, hiddenProjectCount } = data;
  const env = getEnv();
  const pageUrl = `${env.PUBLIC_SITE_URL}/p/${profile.username}`;
  const place = [profile.city, profile.province].filter(Boolean).join(', ');
  const cover = imageUrl(profile.coverKey);
  const avatar = imageUrl(profile.avatarKey);
  const logo = imageUrl(profile.logoKey);
  const photoCount = projects.reduce((sum, p) => sum + p.photos.length, 0);
  const photosRemaining = Math.max(0, entitlements.limits.photos - photoCount);
  const telHref = profile.phone ? `tel:${profile.phone.replace(/[^+\d]/g, '')}` : null;
  const { welcome } = await searchParams;

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
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }} />

      {isOwner && (
        <div className="border-b bg-subtle">
          <div className="container-page flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-muted-foreground">
              <span className="font-medium text-foreground">This is your profile.</span> Only you can see the edit controls.{' '}
              <Badge variant={entitlements.plan === 'premium' ? 'accent' : 'outline'}>{entitlements.plan === 'premium' ? 'Premium' : 'Free plan'}</Badge>
            </p>
            <nav aria-label="Manage profile" className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 sm:pb-0">
              <ProfileEditor
                initial={{
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
              <Button asChild variant="outline" size="sm">
                <Link href="/quotations">
                  <FileText aria-hidden /> Quotations
                </Link>
              </Button>
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

      <div className="container-page grid gap-8 pb-8">
        {/* Cover + identity */}
        <div>
          <div className="relative -mx-4 h-36 overflow-hidden bg-gradient-to-br from-slate-800 to-slate-600 sm:mx-0 sm:mt-6 sm:h-56 sm:rounded-xl">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {cover && <img src={cover} alt="" className="size-full object-cover" fetchPriority="high" />}
            {isOwner && <ImageUpload kind="cover" label="Cover photo" className="absolute bottom-3 right-3" locked={!entitlements.limits.customCoverPhoto} />}
          </div>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between sm:px-6">
            <div className="flex items-end gap-4">
              <div className="relative -mt-12 shrink-0 sm:-mt-14">
                <div className="flex size-24 items-center justify-center overflow-hidden rounded-full border-4 border-background bg-muted text-3xl font-semibold text-muted-foreground sm:size-28">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {avatar ? <img src={avatar} alt={`${profile.businessName} profile photo`} className="size-full object-cover" /> : profile.businessName[0]?.toUpperCase()}
                </div>
                {isOwner && <ImageUpload kind="avatar" label="Photo" maxDimension={640} className="absolute -bottom-2 left-1/2 -translate-x-1/2" />}
              </div>
              {(logo || isOwner) && (
                <div className="relative mb-1">
                  {logo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={logo} alt={`${profile.businessName} logo`} className="h-12 max-w-28 rounded-md border bg-white object-contain p-1" />
                  ) : null}
                  {isOwner && <ImageUpload kind="logo" label="Logo" maxDimension={640} className={logo ? 'absolute -bottom-4 left-0' : ''} />}
                </div>
              )}
            </div>
            <div className="hidden gap-2 sm:flex">
              <ShareTools url={pageUrl} businessName={profile.businessName} />
              {!isOwner && <InquiryDialog username={profile.username} businessName={profile.businessName} siteKey={env.TURNSTILE_SITE_KEY} size="md" />}
            </div>
          </div>
        </div>

        {isOwner && welcome && <Alert variant="success">Your profile is live. Add a photo, a short description and your first project so clients can see your work.</Alert>}
        {isOwner && !profile.isPublished && (
          <Alert variant="warning">
            <EyeOff className="mr-1.5 inline size-4" aria-hidden /> Your profile is hidden. Turn on “Show my profile publicly” in Edit profile to appear in the directory.
          </Alert>
        )}
        {profile.status === 'suspended' && <Alert variant="destructive">This profile has been suspended by Tibay and is not visible to the public.</Alert>}

        <div className="grid gap-8 lg:grid-cols-[1fr_20rem]">
          <div className="grid content-start gap-8">
            <div className="grid gap-3">
              <h1 className="text-2xl font-semibold sm:text-3xl">{profile.businessName}</h1>
              <div className="flex flex-wrap gap-2">
                {professions.map((slug) => (
                  <Link key={slug} href={`/directory?profession=${slug}`}>
                    <Badge variant="accent">{professionLabel(slug)}</Badge>
                  </Link>
                ))}
              </div>
              <ul className="flex flex-wrap gap-x-5 gap-y-1.5 text-sm text-muted-foreground">
                {place && (
                  <li className="inline-flex items-center gap-1.5">
                    <MapPin className="size-4" aria-hidden /> {place}
                  </li>
                )}
                {profile.yearsExperience != null && (
                  <li className="inline-flex items-center gap-1.5">
                    <BriefcaseBusiness className="size-4" aria-hidden /> {profile.yearsExperience} year{profile.yearsExperience === 1 ? '' : 's'} of experience
                  </li>
                )}
              </ul>
            </div>

            {(profile.bio || isOwner) && (
              <Section title="About">
                {profile.bio ? <p className="whitespace-pre-line leading-relaxed text-foreground/90">{profile.bio}</p> : <p className="text-sm text-muted-foreground">Tell clients about your experience — tap “Edit profile”.</p>}
              </Section>
            )}

            {(profile.services.length > 0 || specializations.length > 0) && (
              <Section title="Services">
                <ul className="flex flex-wrap gap-2">
                  {[...new Set([...specializations, ...profile.services])].map((service) => (
                    <li key={service}>
                      <Badge variant="outline" className="px-3 py-1 text-sm text-foreground">
                        {service}
                      </Badge>
                    </li>
                  ))}
                </ul>
              </Section>
            )}

            <Section
              title={`Projects${projects.length ? ` (${projects.length})` : ''}`}
              action={isOwner ? <ProjectEditor canAddProject={projects.length < entitlements.limits.projects} photosRemaining={photosRemaining} /> : undefined}
            >
              {isOwner && hiddenProjectCount > 0 && (
                <Alert variant="warning">
                  Your plan shows {entitlements.limits.projects} projects publicly. {hiddenProjectCount} newer project{hiddenProjectCount === 1 ? ' is' : 's are'} hidden from visitors.{' '}
                  <Link href="/pricing" className="font-medium underline">
                    Upgrade to show all
                  </Link>
                  .
                </Alert>
              )}
              {projects.length === 0 ? (
                <EmptyState icon={<FolderOpen />} title="No projects yet" description={isOwner ? 'Add your first project with photos — profiles with projects get far more inquiries.' : 'This professional has not added projects yet.'} />
              ) : (
                <div className="grid gap-6">
                  {projects.map((project) => (
                    <article key={project.id} className="grid gap-3 rounded-lg border p-4 sm:p-5">
                      <div className="flex items-start justify-between gap-3">
                        <div className="grid gap-0.5">
                          <h3 className="font-semibold">{project.title}</h3>
                          <p className="text-sm text-muted-foreground">{[project.location, project.year].filter(Boolean).join(' · ')}</p>
                        </div>
                        {isOwner && (
                          <ProjectEditor
                            photosRemaining={photosRemaining}
                            project={{ id: project.id, title: project.title, description: project.description, location: project.location, year: project.year, photos: project.photos.map((p) => ({ id: p.id, url: imageUrl(p.key)! })) }}
                          />
                        )}
                      </div>
                      {project.description && <p className="whitespace-pre-line text-sm leading-relaxed text-foreground/90">{project.description}</p>}
                      {project.photos.length > 0 && (
                        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                          {project.photos.map((photo, index) => (
                            <li key={photo.id} className="aspect-[4/3] overflow-hidden rounded-md bg-muted">
                              <a href={imageUrl(photo.key)!} target="_blank" rel="noopener" aria-label={`Open photo ${index + 1} of ${project.title}`}>
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={imageUrl(photo.key)!} alt={`${project.title} — photo ${index + 1}`} loading="lazy" decoding="async" className="size-full object-cover transition-opacity hover:opacity-90" />
                              </a>
                            </li>
                          ))}
                        </ul>
                      )}
                    </article>
                  ))}
                </div>
              )}
            </Section>
          </div>

          <aside className="grid content-start gap-4">
            <div className="grid gap-4 rounded-lg border p-5">
              <h2 className="font-semibold">Contact</h2>
              {!isOwner && <InquiryDialog username={profile.username} businessName={profile.businessName} siteKey={env.TURNSTILE_SITE_KEY} />}
              <ul className="grid gap-1 text-sm">
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
                {!telHref && !profile.messengerUrl && !profile.facebookUrl && isOwner && <li className="px-2 text-muted-foreground">Add your phone, Messenger and Facebook in Edit profile.</li>}
              </ul>
              <div className="sm:hidden">
                <ShareTools url={pageUrl} businessName={profile.businessName} />
              </div>
            </div>
            {profile.serviceAreas.length > 0 && (
              <div className="grid gap-3 rounded-lg border p-5">
                <h2 className="font-semibold">Service coverage</h2>
                <p className="text-sm text-muted-foreground">{[...new Set([profile.province, ...profile.serviceAreas])].filter(Boolean).join(' · ')}</p>
              </div>
            )}
            {!isOwner && <ReportDialog username={profile.username} siteKey={env.TURNSTILE_SITE_KEY} />}
          </aside>
        </div>

        {!entitlements.limits.removePlatformBranding && (
          <p className="border-t pt-6 text-center text-sm text-muted-foreground">
            Made with{' '}
            <Link href="/" className="font-medium text-foreground underline-offset-4 hover:underline">
              Tibay
            </Link>{' '}
            — create your own free builder profile.
          </p>
        )}
      </div>
    </>
  );
}
