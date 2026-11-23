'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Check, Copy, Download, Eye, Link2, Link2Off, Pencil, Send, Share2, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { api, errorMessage, isUpgradeError } from '@/lib/api-client';
import type { QuotationBranding, QuotationDocument } from '@/lib/quotation-pdf';
import { Button } from '../ui/button';
import { ConfirmDialog, Dialog, DialogContent, DialogTrigger } from '../ui/dialog';
import { Alert } from '../ui/misc';

type PdfProps = { quotation: QuotationDocument; branding: QuotationBranding };
const fileName = (q: QuotationDocument) => `${q.number}-${q.clientName.replace(/[^a-z0-9]+/gi, '-').slice(0, 40)}.pdf`;

/**
 * Sends the PDF itself through the phone's share sheet (Messenger, Viber, email…).
 * Where the browser cannot share files (most desktops), the PDF is downloaded instead.
 */
async function sharePdf({ quotation, branding }: PdfProps): Promise<'shared' | 'downloaded' | 'cancelled'> {
  const { buildQuotationPdf } = await import('@/lib/quotation-pdf');
  const doc = await buildQuotationPdf(quotation, branding);
  const file = new File([doc.output('blob')], fileName(quotation), { type: 'application/pdf' });
  if (typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: `Quotation ${quotation.number}`, text: `Quotation ${quotation.number} from ${branding.businessName}` });
      return 'shared';
    } catch (error) {
      if ((error as Error).name === 'AbortError') return 'cancelled';
    }
  }
  doc.save(fileName(quotation));
  return 'downloaded';
}

function usePdfActions(props: PdfProps) {
  const [busy, setBusy] = useState<'download' | 'share' | 'preview' | null>(null);
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
  return {
    busy,
    download: () =>
      run('download', async () => {
        const { downloadQuotationPdf } = await import('@/lib/quotation-pdf');
        await downloadQuotationPdf(props.quotation, props.branding);
      }),
    share: () =>
      run('share', async () => {
        if ((await sharePdf(props)) === 'downloaded') toast.info('PDF downloaded — attach it to your message.');
      }),
    preview: () => {
      // Open the tab synchronously (inside the click) so popup blockers allow it, then point it at the PDF.
      const tab = window.open('', '_blank');
      return run('preview', async () => {
        const { previewQuotationPdf } = await import('@/lib/quotation-pdf');
        const url = await previewQuotationPdf(props.quotation, props.branding);
        if (tab) tab.location.href = url;
        else window.location.href = url;
      });
    },
  };
}

function PdfButtons(props: PdfProps & { primary?: boolean }) {
  const pdf = usePdfActions(props);
  return (
    <>
      <Button variant={props.primary === false ? 'outline' : 'accent'} loading={pdf.busy === 'download'} onClick={() => void pdf.download()}>
        <Download aria-hidden /> Download PDF
      </Button>
      <Button variant="outline" loading={pdf.busy === 'share'} onClick={() => void pdf.share()}>
        <Send aria-hidden /> Share PDF
      </Button>
      <Button variant="outline" loading={pdf.busy === 'preview'} onClick={() => void pdf.preview()}>
        <Eye aria-hidden /> Preview PDF
      </Button>
    </>
  );
}

/** Buttons on the client's read-only link: they can keep or forward the quotation, nothing else. */
export function PublicQuotationActions(props: PdfProps) {
  return (
    <div className="flex flex-wrap gap-2" data-no-print>
      <PdfButtons {...props} />
    </div>
  );
}

type ShareProps = { id: string; siteUrl: string; initialToken: string | null; quotation: QuotationDocument; businessName: string };

/** Owner control for the read-only client link: turn it on, copy / send it, or switch it off again. */
function ShareLinkDialog({ id, siteUrl, initialToken, quotation, businessName }: ShareProps) {
  const [token, setToken] = useState(initialToken);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const url = token ? `${siteUrl}/q/${token}` : null;
  const message = `Hi! Here is quotation ${quotation.number} from ${businessName}:`;

  async function setSharing(enabled: boolean) {
    setBusy(true);
    try {
      const result = await api<{ shareToken: string | null }>(`/api/quotations/${id}/share`, { method: 'POST', body: { enabled }, upgradeReason: 'history' });
      setToken(result.shareToken);
      if (!enabled) toast.success('Link turned off. Anyone who has it can no longer open the quotation.');
    } catch (err) {
      if (!isUpgradeError(err)) toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }
  async function copy() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Could not copy the link.');
    }
  }
  const canNativeShare = typeof navigator !== 'undefined' && !!navigator.share;

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Link2 aria-hidden /> {token ? 'Client link' : 'Share by link'}
        </Button>
      </DialogTrigger>
      <DialogContent title="Share by link" description="Send your client a link they can open on any phone — no app, no download, no account.">
        {url ? (
          <div className="grid gap-4">
            <div className="flex items-center gap-2 rounded-lg border bg-subtle p-2 pl-3 text-sm">
              <span className="min-w-0 flex-1 truncate">{url.replace(/^https?:\/\//, '')}</span>
              <Button variant="outline" size="sm" onClick={() => void copy()}>
                {copied ? <Check aria-hidden /> : <Copy aria-hidden />} {copied ? 'Copied' : 'Copy'}
              </Button>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {canNativeShare && (
                <Button variant="accent" onClick={() => void navigator.share({ title: `Quotation ${quotation.number}`, text: message, url }).catch(() => undefined)}>
                  <Share2 aria-hidden /> Send via…
                </Button>
              )}
              <Button asChild variant="outline">
                <a href={`sms:?&body=${encodeURIComponent(`${message} ${url}`)}`}>Send by SMS</a>
              </Button>
              <Button asChild variant="outline">
                <a href={`mailto:?subject=${encodeURIComponent(`Quotation ${quotation.number} from ${businessName}`)}&body=${encodeURIComponent(`${message}\n${url}`)}`}>Send by email</a>
              </Button>
              <Button asChild variant="outline">
                <a href={url} target="_blank" rel="noopener">
                  <Eye aria-hidden /> See what they see
                </a>
              </Button>
            </div>
            <Alert>Anyone with this link can view the quotation. It always shows your latest saved version.</Alert>
            <Button variant="ghost" className="justify-self-start text-destructive" loading={busy} onClick={() => void setSharing(false)}>
              <Link2Off aria-hidden /> Turn off link
            </Button>
          </div>
        ) : (
          <div className="grid gap-4">
            <p className="text-sm leading-relaxed text-muted-foreground">Creating a link does not use your monthly quotation quota. You can switch it off at any time, which makes the old link stop working.</p>
            <Button variant="accent" size="lg" loading={busy} onClick={() => void setSharing(true)}>
              <Link2 aria-hidden /> Create link
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

type Props = PdfProps & { id: string; siteUrl: string; shareToken: string | null };

export function QuotationActions({ id, quotation, branding, siteUrl, shareToken }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState<'duplicate' | 'delete' | null>(null);
  const [confirm, setConfirm] = useState(false);

  const run = async (kind: NonNullable<typeof busy>, task: () => Promise<void>) => {
    setBusy(kind);
    try {
      await task();
    } catch (err) {
      if (!isUpgradeError(err)) toast.error(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };
  const duplicate = () =>
    run('duplicate', async () => {
      const copy = await api<{ id: string }>(`/api/quotations/${id}/duplicate`, { method: 'POST', upgradeReason: 'quotations' });
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
    <div className="flex flex-wrap gap-2" data-no-print>
      <PdfButtons quotation={quotation} branding={branding} />
      <ShareLinkDialog id={id} siteUrl={siteUrl} initialToken={shareToken} quotation={quotation} businessName={branding.businessName} />
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
      <ConfirmDialog open={confirm} onOpenChange={setConfirm} title="Delete this quotation?" description={`${quotation.number} for ${quotation.clientName} will be permanently deleted${shareToken ? ' and its client link will stop working' : ''}. This does not restore your monthly quota.`} confirmLabel="Delete quotation" loading={busy === 'delete'} onConfirm={remove} />
    </div>
  );
}
