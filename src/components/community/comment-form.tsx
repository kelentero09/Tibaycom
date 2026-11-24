'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { api, errorMessage } from '@/lib/api-client';
import { Button } from '../ui/button';
import { Textarea } from '../ui/form';

export function CommentForm({ postId }: { postId: string }) {
  const router = useRouter();
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!body.trim()) return;
    setBusy(true);
    try {
      await api(`/api/posts/${postId}/comments`, { method: 'POST', body: { body } });
      setBody('');
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="grid gap-2">
      <label htmlFor="comment-body" className="sr-only">
        Write a comment
      </label>
      <Textarea id="comment-body" rows={2} maxLength={1000} value={body} placeholder="Write a comment…" onChange={(e) => setBody(e.target.value)} />
      <Button type="submit" size="sm" loading={busy} disabled={!body.trim()} className="justify-self-end">
        Comment
      </Button>
    </form>
  );
}
