'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { api, errorMessage } from '@/lib/api-client';
import { Button } from '../ui/button';
import { Dialog, DialogContent } from '../ui/dialog';
import { Field, Select, Textarea } from '../ui/form';

const REASONS = [
  { value: 'spam', label: 'Spam or advertising' },
  { value: 'scam', label: 'Scam or fraud' },
  { value: 'fake', label: 'Fake or misleading' },
  { value: 'inappropriate', label: 'Offensive or inappropriate' },
  { value: 'other', label: 'Something else' },
] as const;

type Props = { open: boolean; onOpenChange: (open: boolean) => void; postId: string; commentId?: string | null };

export function ReportContentDialog({ open, onOpenChange, postId, commentId = null }: Props) {
  const [reason, setReason] = useState<(typeof REASONS)[number]['value']>('spam');
  const [details, setDetails] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      await api('/api/reports/content', { method: 'POST', body: { postId, commentId, reason, details } });
      toast.success('Thanks. Our team will review it.');
      setDetails('');
      onOpenChange(false);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={commentId ? 'Report comment' : 'Report post'} description="Reports are private. The author is not told who reported them.">
        <form onSubmit={submit} className="grid gap-4">
          <Field label="Reason" htmlFor={`report-reason-${commentId ?? postId}`}>
            <Select id={`report-reason-${commentId ?? postId}`} value={reason} onChange={(e) => setReason(e.target.value as typeof reason)}>
              {REASONS.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Details (optional)" htmlFor={`report-details-${commentId ?? postId}`}>
            <Textarea id={`report-details-${commentId ?? postId}`} rows={3} maxLength={1000} value={details} onChange={(e) => setDetails(e.target.value)} />
          </Field>
          <Button type="submit" loading={busy}>
            Send report
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
