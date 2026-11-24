import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Inbox } from 'lucide-react';
import { InboxList } from '@/components/inbox-list';
import { Button } from '@/components/ui/button';
import { EmptyState, PageHeader } from '@/components/ui/misc';
import { requireUser } from '@/server/auth';
import { INQUIRY_RETENTION_DAYS } from '@/server/maintenance';
import { emailFromContact, listMessages } from '@/server/inquiries';
import { getProfileByUserId, listInquiries } from '@/server/profiles';

export const metadata: Metadata = { title: 'Requests', robots: { index: false } };

const currentTime = () => Date.now();

export default async function InboxPage({ searchParams }: { searchParams: Promise<{ view?: string; c?: string }> }) {
  const user = await requireUser('/inbox');
  const profile = await getProfileByUserId(user.id);
  if (!profile) redirect('/onboarding');
  const { view, c } = await searchParams;
  const archived = view === 'archived';
  const items = await listInquiries(profile.id, archived);
  const messages = await listMessages(items.map((i) => i.id));
  const tab = (active: boolean) => `rounded-full px-4 py-2 text-sm font-medium ${active ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground'}`;

  return (
    <div className="container-page grid max-w-6xl gap-4 py-6">
      <PageHeader
        title="Requests"
        description="Quotation requests from your profile. Open one to read it and reply."
        actions={
          <Button asChild variant="outline">
            <Link href={`/p/${profile.username}`}>View my profile</Link>
          </Button>
        }
      />
      <nav aria-label="Request folders" className="flex gap-1">
        <Link href="/inbox" className={tab(!archived)} aria-current={!archived ? 'page' : undefined}>
          Inbox
        </Link>
        <Link href="/inbox?view=archived" className={tab(archived)} aria-current={archived ? 'page' : undefined}>
          Archived
        </Link>
      </nav>
      {items.length === 0 ? (
        <EmptyState
          icon={<Inbox />}
          title={archived ? 'Nothing archived' : 'No requests yet'}
          description={archived ? 'Requests you archive are kept here.' : 'When a client taps “Request a quotation” on your profile, it appears here. Share your profile link to get your first one.'}
          action={
            !archived ? (
              <Button asChild>
                <Link href={`/p/${profile.username}`}>Share my profile</Link>
              </Button>
            ) : undefined
          }
        />
      ) : (
        <InboxList
          now={currentTime()}
          archived={archived}
          initialId={c ?? null}
          items={items.map((item) => ({
            id: item.id,
            name: item.name,
            contact: item.contact,
            message: item.message,
            status: item.status,
            emailSent: item.emailSent,
            createdAt: item.createdAt.getTime(),
            messages: messages.get(item.id) ?? [],
            clientGetsEmail: !!emailFromContact(item.contact),
            clientReadAt: item.clientReadAt?.getTime() ?? null,
          }))}
        />
      )}
      <p className="text-xs text-muted-foreground">Requests are removed automatically after {INQUIRY_RETENTION_DAYS} days to protect your clients’ privacy.</p>
    </div>
  );
}
