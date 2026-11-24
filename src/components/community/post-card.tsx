'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Flag, Heart, MapPin, MessageCircle, MoreHorizontal, Trash2, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { api, errorMessage } from '@/lib/api-client';
import { INTENT_INFO, POST_KIND_LABELS, timeAgo, type Intent, type PostKind } from '@/lib/community';
import { cn } from '@/lib/utils';
import { ConfirmDialog } from '../ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '../ui/dropdown';
import { Badge, type BadgeVariant } from '../ui/misc';
import { ReportContentDialog } from './report-content-dialog';

/** Serialisable post as produced by `getFeed` / `getPost` / `getProfilePosts` in src/server/community.ts. */
export type PostCardData = {
  id: string;
  kind: PostKind;
  body: string;
  province: string;
  city: string;
  heartCount: number;
  commentCount: number;
  createdAt: string;
  author: { profileId: string; username: string; businessName: string; avatarUrl: string | null; intent: Intent };
  authorUserId: string;
  photos: { id: string; url: string }[];
  project: { id: string; title: string } | null;
  viewerHearted: boolean;
  authorPremium?: boolean;
  featured?: boolean;
};

export type PostViewer = { signedIn: boolean; isAuthor: boolean };

const KIND_VARIANT: Record<PostKind, BadgeVariant> = { update: 'neutral', showcase: 'accent', looking_for_work: 'success', hiring: 'warning', looking_for_contractor: 'accent' };

export function Avatar({ url, name, size = 'md' }: { url: string | null; name: string; size?: 'sm' | 'md' }) {
  return (
    <span className={cn('flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted font-semibold text-muted-foreground', size === 'sm' ? 'size-8 text-xs' : 'size-11 text-sm')}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {url ? <img src={url} alt="" className="size-full object-cover" /> : (name.trim()[0] ?? '?').toUpperCase()}
    </span>
  );
}

function HeartButton({ post, signedIn }: { post: PostCardData; signedIn: boolean }) {
  const router = useRouter();
  const [hearted, setHearted] = useState(post.viewerHearted);
  const [count, setCount] = useState(post.heartCount);
  const [busy, setBusy] = useState(false);

  async function toggle() {
    if (!signedIn) return router.push(`/login?next=${encodeURIComponent(`/community/${post.id}`)}`);
    if (busy) return;
    const next = !hearted;
    // Optimistic: flip immediately, reconcile with the server's count, roll back on failure.
    setHearted(next);
    setCount((c) => Math.max(0, c + (next ? 1 : -1)));
    setBusy(true);
    try {
      const result = await api<{ hearted: boolean; heartCount: number }>(`/api/posts/${post.id}/heart`, { method: next ? 'POST' : 'DELETE' });
      setHearted(result.hearted);
      setCount(result.heartCount);
    } catch (err) {
      setHearted(!next);
      setCount((c) => Math.max(0, c + (next ? -1 : 1)));
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={() => void toggle()}
      aria-pressed={hearted}
      aria-label={hearted ? `Remove heart (${count})` : `Heart this post (${count})`}
      className={cn('inline-flex min-h-10 items-center gap-1.5 rounded-full px-3 text-sm hover:bg-muted', hearted ? 'text-destructive' : 'text-muted-foreground')}
    >
      <Heart className={cn('size-4.5 transition-transform active:scale-125', hearted && 'fill-current')} aria-hidden />
      <span className="tabular-nums">{count}</span>
    </button>
  );
}

/**
 * One community post. Used in the feed, on the post page and on profile pages.
 * `linkToPost` makes the body and comment count link to the post page (off on the post page itself).
 */
export function PostCard({ post, viewer, linkToPost = true, onDeleted }: { post: PostCardData; viewer: PostViewer; linkToPost?: boolean; onDeleted?: () => void }) {
  const router = useRouter();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [expanded, setExpanded] = useState(!linkToPost);
  const place = [post.city, post.province].filter(Boolean).join(', ');
  const long = post.body.length > 400;
  const body = long && !expanded ? `${post.body.slice(0, 400).trimEnd()}…` : post.body;

  async function remove() {
    setDeleting(true);
    try {
      await api(`/api/posts/${post.id}`, { method: 'DELETE' });
      toast.success('Post deleted');
      setConfirmDelete(false);
      if (onDeleted) onDeleted();
      else if (!linkToPost) router.push('/community');
      else router.refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setDeleting(false);
    }
  }

  return (
    <article className="grid gap-3 rounded-xl border bg-background p-4 shadow-card sm:p-5">
      <header className="flex items-start gap-3">
        <Link href={`/p/${post.author.username}`} className="shrink-0" tabIndex={-1} aria-hidden>
          <Avatar url={post.author.avatarUrl} name={post.author.businessName} />
        </Link>
        <div className="grid min-w-0 flex-1 gap-0.5">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <Link href={`/p/${post.author.username}`} className="truncate font-semibold underline-offset-4 hover:underline">
              {post.author.businessName}
            </Link>
            <Badge variant="outline">{INTENT_INFO[post.author.intent].short}</Badge>
          </div>
          <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
            <time dateTime={post.createdAt}>{timeAgo(new Date(post.createdAt))}</time>
            {place && (
              <span className="inline-flex items-center gap-1">
                <MapPin className="size-3" aria-hidden /> {place}
              </span>
            )}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <Badge variant={KIND_VARIANT[post.kind]}>{POST_KIND_LABELS[post.kind]}</Badge>
          {post.featured && (
            <Badge variant="warning">
              <Sparkles className="size-3" aria-hidden /> Featured
            </Badge>
          )}
        </div>
        {viewer.signedIn && (
          <DropdownMenu>
            <DropdownMenuTrigger className="-mr-2 flex size-9 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted" aria-label="Post options">
              <MoreHorizontal className="size-4.5" aria-hidden />
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              {viewer.isAuthor ? (
                <DropdownMenuItem destructive onSelect={() => setConfirmDelete(true)}>
                  <Trash2 aria-hidden /> Delete post
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem onSelect={() => setReporting(true)}>
                  <Flag aria-hidden /> Report post
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </header>

      <div className="grid gap-1">
        <p className="whitespace-pre-line break-words leading-relaxed text-foreground/90">{body}</p>
        {long && !expanded && (
          <button type="button" className="justify-self-start text-sm font-medium text-primary underline-offset-4 hover:underline" onClick={() => setExpanded(true)}>
            Read more
          </button>
        )}
        {post.project && (
          <p className="text-sm text-muted-foreground">
            Project:{' '}
            <Link href={`/p/${post.author.username}/projects/${post.project.id}`} className="font-medium text-foreground underline-offset-4 hover:underline">
              {post.project.title}
            </Link>
          </p>
        )}
      </div>

      {post.photos.length > 0 && (
        <div className={cn('grid gap-1.5 overflow-hidden rounded-lg', post.photos.length === 1 ? 'grid-cols-1' : 'grid-cols-2')}>
          {post.photos.map((photo, i) => (
            <a
              key={photo.id}
              href={photo.url}
              target="_blank"
              rel="noopener"
              className={cn('block overflow-hidden bg-muted', post.photos.length === 1 ? 'aspect-[16/10]' : 'aspect-square', post.photos.length === 3 && i === 0 && 'row-span-2 aspect-auto')}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={photo.url} alt={`Photo ${i + 1} from ${post.author.businessName}`} loading="lazy" className="size-full object-cover transition-transform hover:scale-[1.02]" />
            </a>
          ))}
        </div>
      )}

      <footer className="-mx-2 -mb-1 flex items-center gap-1 border-t pt-2">
        <HeartButton post={post} signedIn={viewer.signedIn} />
        {linkToPost ? (
          <Link href={`/community/${post.id}`} className="inline-flex min-h-10 items-center gap-1.5 rounded-full px-3 text-sm text-muted-foreground hover:bg-muted">
            <MessageCircle className="size-4.5" aria-hidden />
            <span className="tabular-nums">{post.commentCount}</span>
            <span className="sr-only">comments, open post</span>
          </Link>
        ) : (
          <span className="inline-flex min-h-10 items-center gap-1.5 px-3 text-sm text-muted-foreground">
            <MessageCircle className="size-4.5" aria-hidden />
            <span className="tabular-nums">{post.commentCount}</span> {post.commentCount === 1 ? 'comment' : 'comments'}
          </span>
        )}
      </footer>

      <ConfirmDialog open={confirmDelete} onOpenChange={setConfirmDelete} title="Delete this post?" description="The post, its photos, hearts and comments are removed for good." confirmLabel="Delete post" loading={deleting} onConfirm={remove} />
      <ReportContentDialog open={reporting} onOpenChange={setReporting} postId={post.id} />
    </article>
  );
}
