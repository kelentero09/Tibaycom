import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { cache } from 'react';
import { ArrowLeft, CalendarRange, MapPin } from 'lucide-react';
import { PhotoGallery } from '@/components/profile/photo-gallery';
import { PreviewBar } from '@/components/profile/preview-bar';
import { ProjectEditor } from '@/components/profile/project-editor';
import { InquiryDialog } from '@/components/profile/visitor-tools';
import { Badge } from '@/components/ui/misc';
import { isProfessionalIntent, PROJECT_STATUS_LABELS, projectPeriod } from '@/lib/community';
import { getSession, isAdmin } from '@/server/auth';
import { getEnv } from '@/server/db';
import { getFullProfile } from '@/server/profiles';
import { imageUrl } from '@/server/storage';

type Props = { params: Promise<{ username: string; projectId: string }>; searchParams: Promise<{ view?: string }> };

/** The project as the current viewer may see it (visitors get only what the owner's plan shows). */
const load = cache(async (username: string, projectId: string, preview: boolean) => {
  const session = await getSession();
  const data = await getFullProfile(username, session?.user.id ?? null, session ? isAdmin(session.user) : false, preview);
  if (!data || !isProfessionalIntent(data.profile.intent)) return null;
  const project = data.projects.find((p) => p.id === projectId);
  if (!project) return null;
  return { ...data, project, editing: data.isOwner && !preview };
});

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { username, projectId } = await params;
  const data = await load(username, projectId, false);
  if (!data) return { title: 'Project not found', robots: { index: false } };
  const { profile, project } = data;
  const title = `${project.title} — ${profile.businessName}`;
  const description = (project.description || `A ${PROJECT_STATUS_LABELS[project.status].toLowerCase()} project by ${profile.businessName}${project.location ? ` in ${project.location}` : ''}.`).slice(0, 160);
  const image = imageUrl(project.photos[0]?.key ?? null);
  const hidden = profile.status !== 'active' || !profile.isPublished;
  return {
    title,
    description,
    alternates: { canonical: `/p/${profile.username}/projects/${project.id}` },
    robots: hidden ? { index: false } : undefined,
    openGraph: { title, description, type: 'article', url: `/p/${profile.username}/projects/${project.id}`, images: image ? [image] : undefined },
  };
}

const statusVariant = { planning: 'outline', ongoing: 'warning', completed: 'success' } as const;

export default async function ProjectPage({ params, searchParams }: Props) {
  const { username, projectId } = await params;
  const preview = (await searchParams).view === 'public';
  const data = await load(username, projectId, preview);
  if (!data) notFound();
  const { profile, project, editing, entitlements, isOwner } = data;
  const env = getEnv();
  const photos = project.photos.map((p) => ({ id: p.id, url: imageUrl(p.key)! }));
  const period = projectPeriod(project);
  const profileHref = `/p/${profile.username}${preview ? '?view=public' : ''}`;

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'CreativeWork',
    name: project.title,
    description: project.description || undefined,
    url: `${env.PUBLIC_SITE_URL}/p/${profile.username}/projects/${project.id}`,
    image: photos[0] ? `${env.PUBLIC_SITE_URL}${photos[0].url}` : undefined,
    creator: { '@type': 'LocalBusiness', name: profile.businessName, url: `${env.PUBLIC_SITE_URL}/p/${profile.username}` },
    locationCreated: project.location ? { '@type': 'Place', name: project.location } : undefined,
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }} />
      {isOwner && preview && <PreviewBar username={profile.username} url={`${env.PUBLIC_SITE_URL}/p/${profile.username}/projects/${project.id}`} isPublished={profile.isPublished && profile.status === 'active'} />}

      <div className="container-page grid gap-8 py-8">
        <Link href={profileHref} className="inline-flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" aria-hidden /> {profile.businessName}
        </Link>

        <header className="flex flex-wrap items-start justify-between gap-4">
          <div className="grid gap-2">
            <Badge variant={statusVariant[project.status]} className="w-fit">
              {PROJECT_STATUS_LABELS[project.status]}
            </Badge>
            <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{project.title}</h1>
            <ul className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-muted-foreground">
              {project.location && (
                <li className="inline-flex items-center gap-1.5">
                  <MapPin className="size-4" aria-hidden /> {project.location}
                </li>
              )}
              {period && (
                <li className="inline-flex items-center gap-1.5">
                  <CalendarRange className="size-4" aria-hidden /> {period}
                </li>
              )}
            </ul>
          </div>
          <div className="flex gap-2">
            {editing && (
              <ProjectEditor
                photoLimit={entitlements.limits.photosPerProject}
                project={{ id: project.id, title: project.title, description: project.description, location: project.location, year: project.year, status: project.status, startDate: project.startDate, endDate: project.endDate, photos }}
              />
            )}
            {!isOwner && <InquiryDialog username={profile.username} businessName={profile.businessName} siteKey={env.TURNSTILE_SITE_KEY} size="md" />}
          </div>
        </header>

        {photos.length > 0 && <PhotoGallery title={project.title} photos={photos} />}

        {project.description && <p className="max-w-3xl whitespace-pre-line text-base leading-relaxed text-foreground/90">{project.description}</p>}

      </div>
    </>
  );
}
