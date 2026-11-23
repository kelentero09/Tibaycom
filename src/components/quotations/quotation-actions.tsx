'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Copy, Download, Eye, Pencil, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { api, errorMessage } from '@/lib/api-client';
import type { QuotationBranding, QuotationDocument } from '@/lib/quotation-pdf';
import { Button } from '../ui/button';
import { ConfirmDialog } from '../ui/dialog';

type Props = { id: string; quotation: QuotationDocument; branding: QuotationBranding };

export function QuotationActions({ id, quotation, branding }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState<'download' | 'preview' | 'duplicate' | 'delete' | null>(null);
  const [confirm, setConfirm] = useState(false);

  const run = async (kind: NonNullable<typeof busy>, task: () => Promise<void>) => {
    setBusy(kind);
    try {
      await task();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  const download = () =>
    run('download', async () => {
      const { downloadQuotationPdf } = await import('@/lib/quotation-pdf');
      await downloadQuotationPdf(quotation, branding);
    });
  const preview = () => {
    // Open the tab synchronously (inside the click) so popup blockers allow it, then point it at the PDF.
    const tab = window.open('', '_blank');
    return run('preview', async () => {
      const { previewQuotationPdf } = await import('@/lib/quotation-pdf');
      const url = await previewQuotationPdf(quotation, branding);
      if (tab) tab.location.href = url;
      else window.location.href = url;
    });
  };
  const duplicate = () =>
    run('duplicate', async () => {
      const copy = await api<{ id: string }>(`/api/quotations/${id}/duplicate`, { method: 'POST' });
      toast.success('Quotation duplicated');
      router.push(`/quotations/${copy.id}/edit`);
    });
  const remove = () =>
    run('delete', async () => {
      await api(`/api/quotations/${id}`, { method: 'DELETE' });
      toast.success('Quotation deleted');
      router.push('/quotations');
      router.refresh();
    });

  return (
    <div className="flex flex-wrap gap-2">
      <Button variant="accent" loading={busy === 'download'} onClick={() => void download()}>
        <Download aria-hidden /> Download PDF
      </Button>
      <Button variant="outline" loading={busy === 'preview'} onClick={() => void preview()}>
        <Eye aria-hidden /> Preview PDF
      </Button>
      <Button asChild variant="outline">
        <Link href={`/quotations/${id}/edit`}>
          <Pencil aria-hidden /> Edit
        </Link>
      </Button>
      <Button variant="outline" loading={busy === 'duplicate'} onClick={() => void duplicate()}>
        <Copy aria-hidden /> Duplicate
      </Button>
      <Button variant="ghost" className="text-destructive" onClick={() => setConfirm(true)}>
        <Trash2 aria-hidden /> Delete
      </Button>
      <ConfirmDialog open={confirm} onOpenChange={setConfirm} title="Delete this quotation?" description={`${quotation.number} for ${quotation.clientName} will be permanently deleted. This does not restore your monthly quota.`} confirmLabel="Delete quotation" loading={busy === 'delete'} onConfirm={remove} />
    </div>
  );
}
