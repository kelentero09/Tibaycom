import Link from 'next/link';
import { notFound } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { DataTable } from '@/components/admin/data-table';
import { Button } from '@/components/ui/button';
import { Badge, PageHeader } from '@/components/ui/misc';
import { requireAdmin } from '@/server/auth';
import { getDb, schema } from '@/server/db';
import { getProjects } from '@/server/profiles';
import { imageUrl } from '@/server/storage';

export const metadata = { title: 'Profile moderation' };

export default async function AdminProfileDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const profile = await getDb().select().from(schema.profiles).where(eq(schema.profiles.id, id)).get();
  if (!profile) notFound();
  const projects = await getProjects(profile.id);
  const photos = projects.flatMap((project) => project.photos.map((photo) => ({ ...photo, title: project.title })));
  return (
    <div className="grid gap-6">
      <PageHeader
        title={profile.businessName}
        description={`@${profile.username} · ${[profile.city, profile.province].filter(Boolean).join(', ') || 'No location'}`}
        actions={
          <Button asChild variant="outline">
            <Link href={`/p/${profile.username}`}>Open public page</Link>
          </Button>
        }
      />
      <p>
        <Badge variant={profile.status === 'active' ? 'success' : 'destructive'}>{profile.status}</Badge>
      </p>
      <section className="grid gap-3">
        <h2 className="font-semibold">Projects ({projects.length})</h2>
        <DataTable
          page={1}
          hasMore={false}
          emptyTitle="No projects"
          rows={projects.map((p) => ({ id: p.id, title: p.title, location: p.location, photos: p.photos.length, createdAt: p.createdAt.getTime() }))}
          columns={[
            { key: 'title', header: 'Title' },
            { key: 'location', header: 'Location' },
            { key: 'photos', header: 'Photos', align: 'right' },
            { key: 'createdAt', header: 'Created', type: 'date' },
          ]}
          actions={[
            {
              label: 'Delete project',
              action: 'project.delete',
              payload: { projectId: 'id' },
              destructive: true,
              confirm: { title: 'Delete this project?', description: 'The project and its photos are permanently removed. This is recorded in the audit log.' },
            },
          ]}
        />
      </section>
      {photos.length > 0 && (
        <section className="grid gap-3">
          <h2 className="font-semibold">Photos</h2>
          <ul className="grid grid-cols-3 gap-2 sm:grid-cols-6">
            {photos.map((photo) => (
              <li key={photo.id} className="aspect-square overflow-hidden rounded-md border bg-muted">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={imageUrl(photo.key)!} alt={`Photo from ${photo.title}`} loading="lazy" className="size-full object-cover" />
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
