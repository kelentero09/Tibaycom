import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Lock } from 'lucide-react';
import { ThreadReplyForm } from '@/components/thread-reply-form';
import { Alert } from '@/components/ui/misc';
import { timeAgo } from '@/lib/community';
import { getThreadByToken, markClientRead } from '@/server/inquiries';
import { INQUIRY_RETENTION_DAYS } from '@/server/maintenance';
import { imageUrl } from '@/server/storage';

// A private link: never indexed, and the token is never leaked to other sites through the Referer header.
export const metadata: Metadata = { title: 'Your conversation', robots: { index: false, follow: false }, referrer: 'no-referrer' };

/** Request time for relative dates (kept out of render for the purity lint rule). */
const currentTime = () => Date.now();

export default async function ThreadPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const thread = await getThreadByToken(token);
  if (!thread) notFound();
  await markClientRead(thread.inquiry.id);
  const { inquiry, messages, businessName, username, profileActive } = thread;
  const avatar = imageUrl(thread.avatarKey);
  const now = currentTime();
  const bubble = (mine: boolean) => `max-w-[85%] rounded-2xl px-4 py-2.5 text-sm ${mine ? 'justify-self-end bg-primary text-primary-foreground' : 'justify-self-start bg-muted'}`;
  const meta = (mine: boolean) => `mt-1 text-[11px] ${mine ? 'text-primary-foreground/70' : 'text-muted-foreground'}`;

  return (
    <div className="container-page grid max-w-2xl gap-6 py-8">
      <header className="flex items-center gap-3">
        <div className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted font-semibold text-muted-foreground">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {avatar ? <img src={avatar} alt="" className="size-full object-cover" /> : businessName[0]?.toUpperCase()}
        </div>
        <div className="grid">
          <h1 className="text-lg font-semibold">Your request to {businessName}</h1>
          {profileActive ? (
            <Link href={`/p/${username}`} className="text-sm text-muted-foreground hover:underline">
              View their profile
            </Link>
          ) : null}
        </div>
      </header>

      <Alert variant="neutral">
        <Lock className="mr-1.5 inline size-4" aria-hidden /> This page is private to you and {businessName}. Anyone with this link can read and reply, so do not share it.
      </Alert>

      <ol className="grid gap-3" aria-label="Conversation">
        <li className={bubble(true)}>
          <p className="whitespace-pre-line">{inquiry.message}</p>
          <p className={meta(true)}>You · {timeAgo(inquiry.createdAt, now)}</p>
        </li>
        {messages.map((m) => {
          const mine = m.sender === 'client';
          return (
            <li key={m.id} className={bubble(mine)}>
              <p className="whitespace-pre-line">{m.body}</p>
              <p className={meta(mine)}>
                {mine ? 'You' : businessName} · {timeAgo(new Date(m.createdAt), now)}
              </p>
            </li>
          );
        })}
      </ol>

      {messages.every((m) => m.sender !== 'pro') && <p className="text-center text-sm text-muted-foreground">{businessName} has not replied yet. Keep this link — their reply will appear here.</p>}

      {profileActive ? <ThreadReplyForm token={token} businessName={businessName} /> : <Alert variant="warning">{businessName} is no longer accepting messages on Tibay.</Alert>}

      <p className="text-xs text-muted-foreground">Conversations are deleted {INQUIRY_RETENTION_DAYS} days after the last message.</p>
    </div>
  );
}
