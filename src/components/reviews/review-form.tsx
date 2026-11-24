'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Star } from 'lucide-react';
import { toast } from 'sonner';
import { api, errorMessage } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import { Button } from '../ui/button';
import { Textarea } from '../ui/form';

const LABELS = ['', 'Poor', 'Fair', 'Good', 'Very good', 'Excellent'];

type Props = { username: string; businessName: string; existing: { id: string; rating: number; body: string } | null };

/** Star picker and text for a member's review. Saving again edits it; the author can also delete it. */
export function ReviewForm({ username, businessName, existing }: Props) {
  const router = useRouter();
  const [editing, setEditing] = useState(!existing);
  const [rating, setRating] = useState(existing?.rating ?? 0);
  const [hover, setHover] = useState(0);
  const [body, setBody] = useState(existing?.body ?? '');
  const [busy, setBusy] = useState(false);
  const shown = hover || rating;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!rating) return toast.error('Choose a star rating.');
    setBusy(true);
    try {
      await api('/api/reviews', { method: 'POST', body: { username, rating, body } });
      toast.success(existing ? 'Review updated.' : 'Thanks for your review!');
      setEditing(false);
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!existing || !confirm('Delete your review?')) return;
    setBusy(true);
    try {
      await api(`/api/reviews/${existing.id}`, { method: 'DELETE' });
      toast.success('Review deleted.');
      setRating(0);
      setBody('');
      setEditing(true);
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  if (!editing && existing)
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-subtle p-4">
        <p className="text-sm text-muted-foreground">You reviewed {businessName}. Your review is shown below.</p>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
            Edit review
          </Button>
          <Button variant="ghost" size="sm" loading={busy} onClick={remove}>
            Delete
          </Button>
        </div>
      </div>
    );

  return (
    <form onSubmit={submit} className="grid gap-3 rounded-xl border bg-background p-4 shadow-card">
      <fieldset className="grid gap-1.5">
        <legend className="text-sm font-medium">{existing ? 'Edit your review' : `Rate ${businessName}`}</legend>
        <div className="flex items-center gap-3" onMouseLeave={() => setHover(0)}>
          <div className="flex" role="radiogroup" aria-label="Star rating">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                role="radio"
                aria-checked={rating === n}
                aria-label={`${n} star${n === 1 ? '' : 's'} — ${LABELS[n]}`}
                onMouseEnter={() => setHover(n)}
                onFocus={() => setHover(n)}
                onBlur={() => setHover(0)}
                onClick={() => setRating(n)}
                className="flex size-10 items-center justify-center rounded-md hover:bg-muted"
              >
                <Star className={cn('size-7', n <= shown ? 'fill-amber-500 text-amber-500' : 'text-muted-foreground/40')} aria-hidden />
              </button>
            ))}
          </div>
          <span className="text-sm text-muted-foreground">{shown ? `${shown}/5 · ${LABELS[shown]}` : 'Tap a star'}</span>
        </div>
      </fieldset>
      <label htmlFor="review-body" className="sr-only">
        Your review
      </label>
      <Textarea
        id="review-body"
        rows={3}
        maxLength={1000}
        value={body}
        placeholder="How was the work, the communication and the timeline? Be fair and specific."
        onChange={(e) => setBody(e.target.value)}
      />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">Your review is public. Your full name is only shown if you have a public Tibay page.</p>
        <div className="flex gap-2">
          {existing && (
            <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(false)}>
              Cancel
            </Button>
          )}
          <Button type="submit" size="sm" loading={busy} disabled={!rating || body.trim().length < 10}>
            {existing ? 'Save review' : 'Post review'}
          </Button>
        </div>
      </div>
    </form>
  );
}
