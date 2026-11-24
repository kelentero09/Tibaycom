import Link from 'next/link';
import { BadgeCheck, MessageSquareQuote } from 'lucide-react';
import { timeAgo } from '@/lib/community';
import type { ReviewItem, ReviewSummary } from '@/server/reviews';
import { imageUrl } from '@/server/storage';
import { Button } from '../ui/button';
import { Badge, EmptyState } from '../ui/misc';
import { OwnerReplyForm, ReportReviewButton } from './review-actions';
import { ReviewForm } from './review-form';
import { Stars } from './stars';

type Props = {
  username: string;
  businessName: string;
  summary: ReviewSummary;
  reviews: ReviewItem[];
  /** Who is looking: drives the write / reply / report controls. */
  viewer: { userId: string | null; isOwner: boolean; preview: boolean };
  now: number;
};

/** Rating summary, the visitor's own review form and the list of reviews with the owner's public replies. */
export function ReviewsSection({ username, businessName, summary, reviews, viewer, now }: Props) {
  const own = viewer.userId ? reviews.find((r) => r.authorUserId === viewer.userId) : undefined;
  const canWrite = !!viewer.userId && !viewer.isOwner;
  const interactive = !viewer.preview;

  return (
    <div className="grid gap-6 lg:grid-cols-[16rem_1fr]">
      <div className="grid content-start gap-3 rounded-xl border bg-background p-5 shadow-card">
        {summary.count ? (
          <>
            <p className="flex items-baseline gap-1.5">
              <span className="text-4xl font-semibold tracking-tight">{summary.average.toFixed(1)}</span>
              <span className="text-muted-foreground">out of 5</span>
            </p>
            <Stars value={summary.average} className="text-xl" />
            <p className="text-sm text-muted-foreground">
              {summary.count} review{summary.count === 1 ? '' : 's'}
            </p>
            <ul className="grid gap-1.5" aria-label="Rating breakdown">
              {[5, 4, 3, 2, 1].map((n) => {
                const c = summary.distribution[n - 1] ?? 0;
                return (
                  <li key={n} className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="w-3 text-right">{n}</span>
                    <span className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                      <span className="block h-full rounded-full bg-amber-500" style={{ width: `${(c / summary.count) * 100}%` }} />
                    </span>
                    <span className="w-6 text-right">{c}</span>
                  </li>
                );
              })}
            </ul>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">No reviews yet.</p>
        )}
      </div>

      <div className="grid content-start gap-4">
        {interactive && canWrite && <ReviewForm username={username} businessName={businessName} existing={own ? { id: own.id, rating: own.rating, body: own.body } : null} />}
        {interactive && !viewer.userId && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-background p-4 shadow-card">
            <p className="text-sm text-muted-foreground">Worked with {businessName}? Log in to leave a review.</p>
            <Button asChild size="sm" variant="outline">
              <Link href={`/login?next=${encodeURIComponent(`/p/${username}#reviews`)}`}>Log in to review</Link>
            </Button>
          </div>
        )}

        {reviews.length === 0 ? (
          <EmptyState
            icon={<MessageSquareQuote />}
            title="No reviews yet"
            description={viewer.isOwner ? 'Ask your past clients to review you — share your page link with them after a job.' : `Be the first to review ${businessName}.`}
          />
        ) : (
          <ul className="grid gap-3">
            {reviews.map((r) => {
              const avatar = imageUrl(r.authorAvatarKey);
              const name = r.authorUsername ? (
                <Link href={`/p/${r.authorUsername}`} className="font-semibold hover:underline">
                  {r.authorName}
                </Link>
              ) : (
                <span className="font-semibold">{r.authorName}</span>
              );
              return (
                <li key={r.id} id={`review-${r.id}`} className="grid gap-3 rounded-xl border bg-background p-4 shadow-card">
                  <div className="flex items-start gap-3">
                    <div className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted font-semibold text-muted-foreground">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      {avatar ? <img src={avatar} alt="" className="size-full object-cover" /> : r.authorName[0]?.toUpperCase()}
                    </div>
                    <div className="grid min-w-0 flex-1 gap-1">
                      <p className="flex flex-wrap items-center gap-2 text-sm">
                        {name}
                        {r.verified && (
                          <Badge variant="success" title="Sent this professional a quotation request through Tibay">
                            <BadgeCheck className="size-3" aria-hidden /> Contacted via Tibay
                          </Badge>
                        )}
                        {r.authorUserId === viewer.userId && <Badge variant="outline">Your review</Badge>}
                      </p>
                      <p className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Stars value={r.rating} className="text-sm" />
                        <span className="sr-only">{r.rating} out of 5 stars</span>
                        <span>
                          {timeAgo(r.createdAt, now)}
                          {r.updatedAt.getTime() - r.createdAt.getTime() > 60_000 ? ' · edited' : ''}
                        </span>
                      </p>
                    </div>
                  </div>
                  <p className="whitespace-pre-line text-sm leading-relaxed text-foreground/90">{r.body}</p>
                  {r.ownerReply && (
                    <div className="grid gap-1 rounded-lg border-l-4 border-l-accent bg-subtle p-3 text-sm">
                      <p className="text-xs font-semibold">Reply from {businessName}</p>
                      <p className="whitespace-pre-line text-foreground/90">{r.ownerReply}</p>
                    </div>
                  )}
                  {interactive && viewer.userId && (
                    <div className="flex flex-wrap items-center gap-1">
                      {viewer.isOwner && <OwnerReplyForm reviewId={r.id} initial={r.ownerReply} />}
                      {r.authorUserId !== viewer.userId && <ReportReviewButton reviewId={r.id} />}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
