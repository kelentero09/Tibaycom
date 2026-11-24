'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Flag, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { api, errorMessage } from '@/lib/api-client';
import { timeAgo, type Intent } from '@/lib/community';
import { ConfirmDialog } from '../ui/dialog';
import { Avatar } from './post-card';
import { ReportContentDialog } from './report-content-dialog';

export type CommentData = {
  id: string;
  postId: string;
  body: string;
  createdAt: string;
  author: { profileId: string; username: string; businessName: string; avatarUrl: string | null; intent: Intent };
  authorUserId: string;
};

type Props = { comments: CommentData[]; viewerUserId: string | null; postAuthorUserId: string };

export function CommentList({ comments, viewerUserId, postAuthorUserId }: Props) {
  const router = useRouter();
  const [deleting, setDeleting] = useState<string | null>(null);
  const [reporting, setReporting] = useState<CommentData | null>(null);
  const [busy, setBusy] = useState(false);

  async function remove() {
    if (!deleting) return;
    setBusy(true);
    try {
      await api(`/api/comments/${deleting}`, { method: 'DELETE' });
      setDeleting(null);
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  if (!comments.length) return <p className="text-sm text-muted-foreground">No comments yet. Start the conversation.</p>;

  return (
    <>
      <ul className="grid gap-4">
        {comments.map((c) => {
          const canDelete = !!viewerUserId && (viewerUserId === c.authorUserId || viewerUserId === postAuthorUserId);
          return (
            <li key={c.id} className="flex items-start gap-3">
              <Link href={`/p/${c.author.username}`} tabIndex={-1} aria-hidden>
                <Avatar url={c.author.avatarUrl} name={c.author.businessName} size="sm" />
              </Link>
              <div className="grid min-w-0 flex-1 gap-1 rounded-lg bg-subtle px-3 py-2">
                <p className="flex flex-wrap items-baseline gap-x-2 text-sm">
                  <Link href={`/p/${c.author.username}`} className="font-medium underline-offset-4 hover:underline">
                    {c.author.businessName}
                  </Link>
                  <time dateTime={c.createdAt} className="text-xs text-muted-foreground">
                    {timeAgo(new Date(c.createdAt))}
                  </time>
                </p>
                <p className="whitespace-pre-line break-words text-sm leading-relaxed">{c.body}</p>
              </div>
              {canDelete ? (
                <button type="button" onClick={() => setDeleting(c.id)} className="flex size-8 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted" aria-label="Delete comment">
                  <Trash2 className="size-4" aria-hidden />
                </button>
              ) : viewerUserId ? (
                <button type="button" onClick={() => setReporting(c)} className="flex size-8 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted" aria-label="Report comment">
                  <Flag className="size-4" aria-hidden />
                </button>
              ) : null}
            </li>
          );
        })}
      </ul>
      <ConfirmDialog open={!!deleting} onOpenChange={(open) => !open && setDeleting(null)} title="Delete this comment?" description="This cannot be undone." confirmLabel="Delete comment" loading={busy} onConfirm={remove} />
      {reporting && <ReportContentDialog open onOpenChange={(open) => !open && setReporting(null)} postId={reporting.postId} commentId={reporting.id} />}
    </>
  );
}
