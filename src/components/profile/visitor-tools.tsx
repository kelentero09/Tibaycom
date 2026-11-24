'use client';

import Link from 'next/link';
import { useRef, useState } from 'react';
import { Check, Copy, Download, Flag, QrCode, Send, Share2 } from 'lucide-react';
import { toast } from 'sonner';
import { api, errorMessage } from '@/lib/api-client';
import { Turnstile, type TurnstileHandle } from '../turnstile';
import { Button } from '../ui/button';
import { Dialog, DialogContent, DialogTrigger } from '../ui/dialog';
import { Field, Input, Select, Textarea } from '../ui/form';
import { Alert } from '../ui/misc';

/** Request-a-quotation form. Delivered to the professional by email; visitors need no account. */
export function InquiryDialog({ username, businessName, siteKey, size = 'lg' }: { username: string; businessName: string; siteKey: string; size?: 'md' | 'lg' }) {
  const [open, setOpen] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const captcha = useRef<TurnstileHandle>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState<{ threadUrl: string; emailReplies: boolean } | null>(null);
  const [copied, setCopied] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) return setError('Please wait for the verification check to finish.');
    const form = new FormData(event.currentTarget);
    setLoading(true);
    setError(null);
    try {
      const result = await api<{ threadUrl: string; emailReplies: boolean }>(`/api/inquiries/${username}`, { method: 'POST', body: { name: form.get('name'), contact: form.get('contact'), message: form.get('message'), turnstileToken: token } });
      setSent(result);
    } catch (err) {
      setError(errorMessage(err));
      captcha.current?.reset();
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => (setOpen(next), next && (setSent(null), setError(null), setToken(null), setCopied(false)))}>
      <DialogTrigger asChild>
        <Button variant="accent" size={size} className="w-full sm:w-auto">
          <Send aria-hidden /> Request a quotation
        </Button>
      </DialogTrigger>
      <DialogContent title={`Contact ${businessName}`} description="Describe your project. They can reply here on Tibay or contact you directly.">
        {sent ? (
          <div className="grid gap-4">
            <Alert variant="success">Your request was sent to {businessName}.</Alert>
            <div className="grid gap-2 rounded-lg border bg-subtle p-3">
              <p className="text-sm font-medium">Your private conversation link</p>
              <p className="text-sm text-muted-foreground">
                Open it to read {businessName}’s reply and answer back.{' '}
                {sent.emailReplies ? 'We will also email you when they reply.' : 'Save it — we cannot email you because you did not give an email address.'}
              </p>
              <div className="flex gap-2">
                <input readOnly value={sent.threadUrl} aria-label="Conversation link" className="h-9 min-w-0 flex-1 rounded-md border bg-background px-2 text-xs" onFocus={(e) => e.currentTarget.select()} />
                <Button
                  size="sm"
                  variant="outline"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(sent.threadUrl);
                      setCopied(true);
                    } catch {
                      toast.error('Could not copy the link');
                    }
                  }}
                >
                  {copied ? <Check aria-hidden /> : <Copy aria-hidden />} {copied ? 'Copied' : 'Copy'}
                </Button>
              </div>
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="outline" onClick={() => setOpen(false)}>
                Close
              </Button>
              <Button asChild>
                <Link href={new URL(sent.threadUrl).pathname}>Open conversation</Link>
              </Button>
            </div>
          </div>
        ) : (
          <form onSubmit={submit} className="grid gap-4" noValidate>
            {error && <Alert variant="destructive">{error}</Alert>}
            <Field label="Your name" htmlFor="iq-name" required>
              <Input id="iq-name" name="name" required maxLength={80} autoComplete="name" />
            </Field>
            <Field label="Mobile number or email" htmlFor="iq-contact" required>
              <Input id="iq-contact" name="contact" required maxLength={120} />
            </Field>
            <Field label="Project details" htmlFor="iq-message" required hint="Location, scope of work, target schedule and budget help them quote accurately.">
              <Textarea id="iq-message" name="message" required rows={5} maxLength={1500} aria-describedby="iq-message-help" />
            </Field>
            <Turnstile siteKey={siteKey} onToken={setToken} ref={captcha} />
            <Button type="submit" variant="accent" loading={loading}>
              Send request
            </Button>
            <p className="text-xs text-muted-foreground">Your details are shared only with this professional. Tibay keeps the conversation for 180 days after the last message.</p>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** Share sheet: copy link, native share, Facebook, and a client-generated QR code (PNG download). */
export function ShareTools({ url, businessName }: { url: string; businessName: string }) {
  const [qr, setQr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function prepare(open: boolean) {
    if (!open || qr) return;
    const { toDataURL } = await import('qrcode');
    setQr(await toDataURL(url, { width: 720, margin: 2, errorCorrectionLevel: 'M', color: { dark: '#0f172a', light: '#ffffff' } }));
  }
  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Could not copy the link.');
    }
  }
  const canShare = typeof navigator !== 'undefined' && !!navigator.share;

  return (
    <Dialog onOpenChange={(open) => void prepare(open)}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Share2 aria-hidden /> Share
        </Button>
      </DialogTrigger>
      <DialogContent title="Share this profile" description="Print the QR code on calling cards, tarpaulins and quotations.">
        <div className="grid gap-4">
          <div className="mx-auto flex size-48 items-center justify-center rounded-lg border bg-white p-2">
            {qr ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={qr} alt={`QR code linking to ${businessName} on Tibay`} className="size-full" />
            ) : (
              <QrCode className="size-8 animate-pulse text-muted-foreground" aria-hidden />
            )}
          </div>
          <div className="flex items-center gap-2 rounded-md border bg-subtle p-2 pl-3 text-sm">
            <span className="min-w-0 flex-1 truncate">{url.replace(/^https?:\/\//, '')}</span>
            <Button variant="outline" size="sm" onClick={() => void copy()}>
              {copied ? <Check aria-hidden /> : <Copy aria-hidden />} {copied ? 'Copied' : 'Copy'}
            </Button>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <Button asChild variant="outline" className={qr ? '' : 'pointer-events-none opacity-50'}>
              <a href={qr ?? '#'} download={`tibay-${businessName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-qr.png`}>
                <Download aria-hidden /> Download QR
              </a>
            </Button>
            <Button asChild variant="outline">
              <a href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`} target="_blank" rel="noopener noreferrer">
                Share on Facebook
              </a>
            </Button>
            {canShare && (
              <Button variant="outline" className="sm:col-span-2" onClick={() => void navigator.share({ title: `${businessName} on Tibay`, url }).catch(() => undefined)}>
                <Share2 aria-hidden /> More options
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function ReportDialog({ username, siteKey }: { username: string; siteKey: string }) {
  const [open, setOpen] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const captcha = useRef<TurnstileHandle>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) return setError('Please wait for the verification check to finish.');
    const form = new FormData(event.currentTarget);
    setLoading(true);
    setError(null);
    try {
      await api('/api/reports', { method: 'POST', body: { username, reason: form.get('reason'), details: form.get('details'), reporterEmail: form.get('email') ?? '', turnstileToken: token } });
      toast.success('Thank you. Our team will review this profile.');
      setOpen(false);
    } catch (err) {
      setError(errorMessage(err));
      captcha.current?.reset();
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => (setOpen(next), next && (setError(null), setToken(null)))}>
      <DialogTrigger className="inline-flex items-center gap-1.5 text-xs text-muted-foreground underline-offset-4 hover:underline">
        <Flag className="size-3.5" aria-hidden /> Report this profile
      </DialogTrigger>
      <DialogContent title="Report this profile" description="Tell us what is wrong. Reports are reviewed by the Tibay team.">
        <form onSubmit={submit} className="grid gap-4" noValidate>
          {error && <Alert variant="destructive">{error}</Alert>}
          <Field label="Reason" htmlFor="rp-reason" required>
            <Select id="rp-reason" name="reason" defaultValue="fake">
              <option value="fake">Fake or misleading profile</option>
              <option value="scam">Scam or fraud</option>
              <option value="inappropriate">Inappropriate content</option>
              <option value="spam">Spam</option>
              <option value="other">Something else</option>
            </Select>
          </Field>
          <Field label="Details" htmlFor="rp-details">
            <Textarea id="rp-details" name="details" rows={4} maxLength={1000} />
          </Field>
          <Field label="Your email (optional)" htmlFor="rp-email" hint="Only used if we need more information.">
            <Input id="rp-email" name="email" type="email" maxLength={120} aria-describedby="rp-email-help" />
          </Field>
          <Turnstile siteKey={siteKey} onToken={setToken} ref={captcha} />
          <Button type="submit" loading={loading}>
            Submit report
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
