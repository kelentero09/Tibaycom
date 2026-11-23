'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { Camera, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { api, errorMessage } from '@/lib/api-client';
import { compressImage } from '@/lib/image-compress';
import { cn } from '@/lib/utils';

type Props = { kind: 'avatar' | 'logo' | 'cover'; label: string; className?: string; maxDimension?: number; locked?: boolean };

/** Owner-only overlay button: pick → compress in browser → upload. */
export function ImageUpload({ kind, label, className, maxDimension, locked }: Props) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function onFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setBusy(true);
    try {
      const blob = await compressImage(file, maxDimension);
      await api(`/api/profile/image?kind=${kind}`, { method: 'PUT', raw: blob });
      toast.success(`${label} updated`);
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" tabIndex={-1} aria-hidden onChange={onFile} />
      <button
        type="button"
        disabled={busy}
        onClick={() => (locked ? toast.info('Custom cover photos are a Premium feature.', { action: { label: 'Upgrade', onClick: () => window.location.assign('/pricing') } }) : input.current?.click())}
        className={cn('inline-flex items-center gap-1.5 rounded-full border bg-background/95 px-3 py-2 text-xs font-medium shadow-sm hover:bg-muted', className)}
        aria-label={`Change ${label.toLowerCase()}`}
      >
        {busy ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <Camera className="size-3.5" aria-hidden />}
        <span>{label}</span>
      </button>
    </>
  );
}
