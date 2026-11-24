'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Send } from 'lucide-react';
import { toast } from 'sonner';
import { api, errorMessage } from '@/lib/api-client';
import { Button } from './ui/button';
import { Textarea } from './ui/form';

/** Client-side reply box on the private conversation page. */
export function ThreadReplyForm({ token, businessName }: { token: string; businessName: string }) {
  const router = useRouter();
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  async function send(event: React.FormEvent) {
    event.preventDefault();
    if (!body.trim()) return;
    setSending(true);
    try {
      await api(`/api/r/${token}/messages`, { method: 'POST', body: { body } });
      setBody('');
      toast.success(`Sent to ${businessName}`);
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSending(false);
    }
  }
  return (
    <form onSubmit={send} className="grid gap-2">
      <Textarea aria-label={`Reply to ${businessName}`} rows={3} maxLength={2000} value={body} placeholder={`Reply to ${businessName}…`} onChange={(e) => setBody(e.target.value)} />
      <Button type="submit" className="justify-self-end" loading={sending} disabled={!body.trim()}>
        <Send aria-hidden /> Send
      </Button>
    </form>
  );
}
