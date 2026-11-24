'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Flag, Reply } from 'lucide-react';
import { toast } from 'sonner';
import { api, errorMessage } from '@/lib/api-client';
import { Button } from '../ui/button';
import { Dialog, DialogContent } from '../ui/dialog';
import { Field, Select, Textarea } from '../ui/form';

const REASONS = [
  { value: 'fake', label: 'Fake — this person was never a client' },
  { value: 'inappropriate', label: 'Offensive or inappropriate' },
  { value: 'spam', label: 'Spam or advertising' },
  { value: 'scam', label: 'Scam or fraud' },
  { value: 'other', label: 'Something else' },
] as const;

/** The reviewed professional's public answer to a review. */
export function OwnerReplyForm({ reviewId, initial }: { reviewId: string; initial: string | null }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState(initial ?? '');
  const [busy, setBusy] = useState(false);

  async function save(text: string) {
    setBusy(true);
    try {
      await api(`/api/reviews/${reviewId}/reply`, { method: 'PUT', body: { body: text } });
      setOpen(false);
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  if (!open)
    return (
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)} className="justify-self-start">
        <Reply aria-hidden /> {initial ? 'Edit reply' : 'Reply publicly'}
      </Button>
    );
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void save(body.trim());
      }}
      className="grid gap-2"
    >
      <label htmlFor={`reply-${reviewId}`} className="sr-only">
        Your public reply
      </label>
      <Textarea id={`reply-${reviewId}`} rows={2} maxLength={1000} value={body} placeholder="Thank the client or explain your side — everyone can read this." onChange={(e) => setBody(e.target.value)} />
      <div className="flex justify-end gap-2">
        {initial && (
          <Button type="button" variant="ghost" size="sm" loading={busy} onClick={() => save('')}>
            Remove reply
          </Button>
        )}
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
          Cancel
        </Button>
        <Button type="submit" size="sm" loading={busy} disabled={!body.trim()}>
          Save reply
        </Button>
      </div>
    </form>
  );
}

export function ReportReviewButton({ reviewId }: { reviewId: string }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<(typeof REASONS)[number]['value']>('fake');
  const [details, setDetails] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      await api(`/api/reviews/${reviewId}/report`, { method: 'POST', body: { reason, details } });
      toast.success('Thanks. Our team will review it.');
      setDetails('');
      setOpen(false);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)} className="text-muted-foreground">
        <Flag aria-hidden /> Report
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent title="Report review" description="Reports are private. Our team checks every report and hides reviews that break the rules.">
          <form onSubmit={submit} className="grid gap-4">
            <Field label="Reason" htmlFor={`rr-reason-${reviewId}`}>
              <Select id={`rr-reason-${reviewId}`} value={reason} onChange={(e) => setReason(e.target.value as typeof reason)}>
                {REASONS.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Details (optional)" htmlFor={`rr-details-${reviewId}`}>
              <Textarea id={`rr-details-${reviewId}`} rows={3} maxLength={1000} value={details} onChange={(e) => setDetails(e.target.value)} />
            </Field>
            <Button type="submit" loading={busy}>
              Send report
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
