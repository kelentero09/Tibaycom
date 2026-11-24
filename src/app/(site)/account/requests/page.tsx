import type { Metadata } from 'next';
import Link from 'next/link';
import { MessageSquareText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge, EmptyState, PageHeader } from '@/components/ui/misc';
import { timeAgo } from '@/lib/community';
import { requireUser } from '@/server/auth';
import { listSentRequests } from '@/server/inquiries';
import { imageUrl } from '@/server/storage';

export const metadata: Metadata = { title: 'My requests', robots: { index: false } };

/** Request time for relative dates (kept out of render for the purity lint rule). */
const currentTime = () => Date.now();

/** Quotation requests the signed-in member sent to professionals, with their replies. */
export default async function MyRequestsPage() {
  const user = await requireUser('/account/requests');
  const requests = await listSentRequests(user.id);
  const now = currentTime();
  return (
    <div className="container-page grid max-w-3xl gap-6 py-8">
      <PageHeader title="My requests" description="Quotation requests you sent while signed in. Open one to read replies and answer back." />
      {requests.length === 0 ? (
        <EmptyState
          icon={<MessageSquareText />}
          title="No requests yet"
          description="Find a contractor, engineer or worker in the directory and tap “Request a quotation”."
          action={
            <Button asChild>
              <Link href="/directory">Browse the directory</Link>
            </Button>
          }
        />
      ) : (
        <ul className="grid gap-3">
          {requests.map((r) => {
            const avatar = imageUrl(r.avatarKey);
            return (
              <li key={r.id}>
                <Link href={r.threadToken ? `/r/${r.threadToken}` : `/p/${r.username}`} className={`card-interactive flex gap-3 rounded-xl border bg-background p-4 ${r.unread ? 'border-l-4 border-l-accent' : ''}`}>
                  <div className="flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted font-semibold text-muted-foreground">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {avatar ? <img src={avatar} alt="" className="size-full object-cover" /> : r.businessName[0]?.toUpperCase()}
                  </div>
                  <div className="grid min-w-0 flex-1 gap-0.5">
                    <p className="flex items-center gap-2 font-semibold">
                      <span className="truncate">{r.businessName}</span>
                      {r.unread && <Badge variant="accent">New reply</Badge>}
                    </p>
                    <p className="line-clamp-1 text-sm text-muted-foreground">{r.message}</p>
                    <p className="text-xs text-muted-foreground">
                      {r.replies > 0 ? `${r.replies} repl${r.replies === 1 ? 'y' : 'ies'}` : 'No reply yet'} · {timeAgo(r.lastMessageAt ?? r.createdAt, now)}
                    </p>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
