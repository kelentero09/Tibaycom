'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { BellRing } from 'lucide-react';
import { toast } from 'sonner';
import { api, errorMessage } from '@/lib/api-client';
import { Button } from '../ui/button';

/** Lets the owner confirm that alerts actually reach them before something real goes wrong. */
export function TestAlertButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function send() {
    setBusy(true);
    try {
      await api('/api/admin/actions/alert.test', { method: 'POST', body: {} });
      toast.success('Test alert sent. Check your email and chat channel.');
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Button variant="outline" size="sm" loading={busy} onClick={() => void send()}>
      <BellRing aria-hidden /> Send test alert
    </Button>
  );
}
