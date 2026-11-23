'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { authClient } from '@/lib/auth-client';
import { Button } from '../ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { ConfirmDialog } from '../ui/dialog';
import { Field, Input } from '../ui/form';
import { Alert, Badge } from '../ui/misc';

export function ChangePasswordCard() {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const newPassword = String(form.get('new'));
    if (newPassword.length < 10) return setError('New password must be at least 10 characters.');
    setLoading(true);
    setError(null);
    const { error } = await authClient.changePassword({ currentPassword: String(form.get('current')), newPassword, revokeOtherSessions: true });
    setLoading(false);
    if (error) return setError(error.status === 429 ? 'Too many attempts. Try again later.' : 'Your current password is incorrect.');
    formElement.reset();
    toast.success('Password changed. Other devices were signed out.');
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Password</CardTitle>
        <CardDescription>Changing your password signs you out of other devices.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="grid max-w-sm gap-4" noValidate>
          {error && <Alert variant="destructive">{error}</Alert>}
          <Field label="Current password" htmlFor="pw-current">
            <Input id="pw-current" name="current" type="password" required autoComplete="current-password" />
          </Field>
          <Field label="New password" htmlFor="pw-new" hint="At least 10 characters.">
            <Input id="pw-new" name="new" type="password" required minLength={10} maxLength={128} autoComplete="new-password" aria-describedby="pw-new-help" />
          </Field>
          <Button type="submit" loading={loading} className="justify-self-start">
            Change password
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

type Setup = { totpURI: string; backupCodes: string[]; qr: string };

export function TwoFactorCard({ enabled, required }: { enabled: boolean; required: boolean }) {
  const router = useRouter();
  const [setup, setSetup] = useState<Setup | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  async function start(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    const password = String(new FormData(event.currentTarget).get('password'));
    const { data, error } = enabled ? await authClient.twoFactor.disable({ password }) : await authClient.twoFactor.enable({ password });
    setLoading(false);
    if (error) return setError('Incorrect password.');
    if (enabled) {
      toast.success('Two-factor authentication turned off');
      return router.refresh();
    }
    if (data && 'totpURI' in data) {
      const { toDataURL } = await import('qrcode');
      setSetup({ totpURI: data.totpURI, backupCodes: data.backupCodes, qr: await toDataURL(data.totpURI, { width: 360, margin: 1 }) });
    }
  }

  async function verify(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    const { error } = await authClient.twoFactor.verifyTotp({ code: String(new FormData(event.currentTarget).get('code')).trim() });
    setLoading(false);
    if (error) return setError('That code is not valid. Check your authenticator app and try again.');
    setDone(true);
    toast.success('Two-factor authentication is on');
    router.refresh();
  }

  const secret = setup ? new URL(setup.totpURI).searchParams.get('secret') : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldCheck className="size-4" aria-hidden /> Two-factor authentication <Badge variant={enabled || done ? 'success' : 'outline'}>{enabled || done ? 'On' : 'Off'}</Badge>
        </CardTitle>
        <CardDescription>Protect your account with a code from an authenticator app (Google Authenticator, Authy, 1Password…).</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {required && !enabled && !done && <Alert variant="warning">Administrator accounts must turn on two-factor authentication before opening the admin area.</Alert>}
        {error && <Alert variant="destructive">{error}</Alert>}
        {setup ? (
          <div className="grid gap-4">
            {!done && (
              <>
                <p className="text-sm">1. Scan this QR code with your authenticator app, or enter the key manually.</p>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={setup.qr} alt="Two-factor authentication QR code" className="size-44 rounded-md border bg-white p-1" />
                {secret && <code className="w-fit break-all rounded bg-muted px-2 py-1 text-xs">{secret}</code>}
                <form onSubmit={verify} className="grid max-w-xs gap-3" noValidate>
                  <Field label="2. Enter the 6-digit code" htmlFor="tf-code">
                    <Input id="tf-code" name="code" inputMode="numeric" autoComplete="one-time-code" required />
                  </Field>
                  <Button type="submit" loading={loading} className="justify-self-start">
                    Verify and turn on
                  </Button>
                </form>
              </>
            )}
            <div className="grid gap-2">
              <p className="text-sm font-medium">Backup codes</p>
              <p className="text-sm text-muted-foreground">Save these somewhere safe. Each code works once if you lose your phone. They will not be shown again.</p>
              <ul className="grid w-fit grid-cols-2 gap-x-6 gap-y-1 rounded-md border bg-subtle p-3 font-mono text-sm">
                {setup.backupCodes.map((code) => (
                  <li key={code}>{code}</li>
                ))}
              </ul>
            </div>
          </div>
        ) : (
          <form onSubmit={start} className="grid max-w-sm gap-4" noValidate>
            <Field label="Confirm your password" htmlFor="tf-password">
              <Input id="tf-password" name="password" type="password" required autoComplete="current-password" />
            </Field>
            <Button type="submit" variant={enabled ? 'outline' : 'primary'} loading={loading} className="justify-self-start">
              {enabled ? 'Turn off two-factor' : 'Set up two-factor'}
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}

export function DeleteAccountCard() {
  const [password, setPassword] = useState('');
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  async function remove() {
    setLoading(true);
    const { error } = await authClient.deleteUser({ password });
    setLoading(false);
    if (error) {
      setOpen(false);
      return void toast.error('Could not delete the account. Check your password and try again.');
    }
    window.location.assign('/');
  }

  return (
    <Card className="border-destructive/30">
      <CardHeader>
        <CardTitle>Delete account</CardTitle>
        <CardDescription>Permanently removes your profile, projects, photos and quotations. This cannot be undone. Any remaining Premium time is forfeited.</CardDescription>
      </CardHeader>
      <CardContent className="grid max-w-sm gap-4">
        <Field label="Confirm your password" htmlFor="del-password">
          <Input id="del-password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        <Button variant="destructive" disabled={!password} className="justify-self-start" onClick={() => setOpen(true)}>
          Delete my account
        </Button>
        <ConfirmDialog open={open} onOpenChange={setOpen} title="Delete your account?" description="Your public profile, portfolio and quotations will be erased immediately and cannot be recovered." confirmLabel="Delete permanently" loading={loading} onConfirm={remove} />
      </CardContent>
    </Card>
  );
}
