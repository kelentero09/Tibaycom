'use client';

import Link from 'next/link';
import { useRef, useState } from 'react';
import { MailCheck } from 'lucide-react';
import { authClient, captchaHeaders } from '@/lib/auth-client';
import { Turnstile, type TurnstileHandle } from './turnstile';
import { Button } from './ui/button';
import { Field, Input } from './ui/form';
import { Alert } from './ui/misc';

/** Only same-site relative paths are accepted as post-login destinations (prevents open redirects). */
const safeNext = (next: string | undefined) => (next && /^\/(?!\/|\\)/.test(next) ? next : '/onboarding');

function useCaptcha() {
  const [token, setToken] = useState<string | null>(null);
  const widget = useRef<TurnstileHandle>(null);
  const reset = () => widget.current?.reset();
  return [token, setToken, widget, reset] as const;
}

function CheckEmail({ email, children }: { email: string; children: React.ReactNode }) {
  return (
    <div className="grid justify-items-center gap-3 py-4 text-center">
      <div className="flex size-12 items-center justify-center rounded-full bg-success-soft text-success">
        <MailCheck className="size-6" aria-hidden />
      </div>
      <h2 className="text-lg font-semibold">Check your email</h2>
      <p className="text-sm text-muted-foreground">
        {children} <span className="font-medium text-foreground">{email}</span>
      </p>
    </div>
  );
}

export function LoginForm({ siteKey, next }: { siteKey: string; next?: string }) {
  const [captchaToken, setCaptchaToken, captchaWidget, resetCaptcha] = useCaptcha();
  const [step, setStep] = useState<'credentials' | 'totp' | 'verify-email'>('credentials');
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [useBackup, setUseBackup] = useState(false);
  const done = () => window.location.assign(safeNext(next));

  async function submitCredentials(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!captchaToken) return setError('Please wait for the verification check to finish.');
    const form = new FormData(event.currentTarget);
    setLoading(true);
    setError(null);
    const { data, error } = await authClient.signIn.email({
      email: String(form.get('email')),
      password: String(form.get('password')),
      fetchOptions: { headers: captchaHeaders(captchaToken) },
    });
    setLoading(false);
    resetCaptcha();
    if (error) {
      if (error.status === 403) return setStep('verify-email');
      if (error.status === 429) return setError('Too many attempts. Please wait a few minutes and try again.');
      return setError('Incorrect email or password.');
    }
    if (data && 'twoFactorRedirect' in data && data.twoFactorRedirect) return setStep('totp');
    done();
  }

  async function submitCode(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const code = String(new FormData(event.currentTarget).get('code')).trim();
    setLoading(true);
    setError(null);
    const { error } = useBackup ? await authClient.twoFactor.verifyBackupCode({ code }) : await authClient.twoFactor.verifyTotp({ code });
    setLoading(false);
    if (error) return setError(error.status === 429 ? 'Too many attempts. Please wait and try again.' : 'That code is not valid. Try again.');
    done();
  }

  if (step === 'verify-email') return <CheckEmail email={email}>Confirm your email to log in. We sent a new link to</CheckEmail>;

  if (step === 'totp')
    return (
      <form onSubmit={submitCode} className="grid gap-4" noValidate>
        {error && <Alert variant="destructive">{error}</Alert>}
        <Field label={useBackup ? 'Backup code' : 'Authentication code'} htmlFor="code" hint={useBackup ? 'Enter one of your saved backup codes.' : 'Enter the 6-digit code from your authenticator app.'}>
          <Input id="code" name="code" required autoFocus autoComplete="one-time-code" inputMode={useBackup ? 'text' : 'numeric'} aria-describedby="code-help" />
        </Field>
        <Button type="submit" loading={loading}>
          Verify
        </Button>
        <Button variant="link" size="sm" onClick={() => setUseBackup((v) => !v)}>
          {useBackup ? 'Use authenticator app instead' : 'Use a backup code instead'}
        </Button>
      </form>
    );

  return (
    <form onSubmit={submitCredentials} className="grid gap-4" noValidate>
      {error && <Alert variant="destructive">{error}</Alert>}
      <Field label="Email" htmlFor="email">
        <Input id="email" name="email" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      </Field>
      <Field label="Password" htmlFor="password">
        <Input id="password" name="password" type="password" required autoComplete="current-password" />
      </Field>
      <Turnstile siteKey={siteKey} onToken={setCaptchaToken} ref={captchaWidget} />
      <Button type="submit" loading={loading}>
        Log in
      </Button>
      <div className="flex justify-between text-sm">
        <Link href="/forgot-password" className="text-muted-foreground underline-offset-4 hover:underline">
          Forgot password?
        </Link>
        <Link href="/register" className="font-medium text-accent underline-offset-4 hover:underline">
          Create an account
        </Link>
      </div>
    </form>
  );
}

export function RegisterForm({ siteKey }: { siteKey: string }) {
  const [captchaToken, setCaptchaToken, captchaWidget, resetCaptcha] = useCaptcha();
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const name = String(form.get('name')).trim();
    const email = String(form.get('email')).trim();
    const password = String(form.get('password'));
    if (name.length < 2) return setError('Please enter your name.');
    if (password.length < 10) return setError('Password must be at least 10 characters.');
    if (!form.get('consent')) return setError('Please agree to the Terms of Service and Privacy Policy.');
    if (!captchaToken) return setError('Please wait for the verification check to finish.');
    setLoading(true);
    setError(null);
    const { error } = await authClient.signUp.email({ name, email, password, callbackURL: '/onboarding', fetchOptions: { headers: captchaHeaders(captchaToken) } });
    setLoading(false);
    resetCaptcha();
    if (error) {
      if (error.status === 429) return setError('Too many attempts. Please try again later.');
      return setError(error.message || 'We could not create your account. Please check your details.');
    }
    setSentTo(email);
  }

  if (sentTo) return <CheckEmail email={sentTo}>We sent a confirmation link to</CheckEmail>;

  return (
    <form onSubmit={submit} className="grid gap-4" noValidate>
      {error && <Alert variant="destructive">{error}</Alert>}
      <Field label="Full name" htmlFor="name">
        <Input id="name" name="name" required autoComplete="name" maxLength={80} />
      </Field>
      <Field label="Email" htmlFor="email">
        <Input id="email" name="email" type="email" required autoComplete="email" />
      </Field>
      <Field label="Password" htmlFor="password" hint="At least 10 characters.">
        <Input id="password" name="password" type="password" required minLength={10} maxLength={128} autoComplete="new-password" aria-describedby="password-help" />
      </Field>
      <label className="flex items-start gap-2.5 text-sm text-muted-foreground">
        <input type="checkbox" name="consent" className="mt-0.5 size-4 accent-[var(--color-primary)]" />
        <span>
          I agree to the{' '}
          <Link href="/terms" className="underline" target="_blank">
            Terms of Service
          </Link>{' '}
          and consent to the processing of my personal data as described in the{' '}
          <Link href="/privacy" className="underline" target="_blank">
            Privacy Policy
          </Link>
          .
        </span>
      </label>
      <Turnstile siteKey={siteKey} onToken={setCaptchaToken} ref={captchaWidget} />
      <Button type="submit" loading={loading}>
        Create free account
      </Button>
      <p className="text-center text-sm text-muted-foreground">
        Already have an account?{' '}
        <Link href="/login" className="font-medium text-accent underline-offset-4 hover:underline">
          Log in
        </Link>
      </p>
    </form>
  );
}

export function ForgotPasswordForm({ siteKey }: { siteKey: string }) {
  const [captchaToken, setCaptchaToken, captchaWidget, resetCaptcha] = useCaptcha();
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const email = String(new FormData(event.currentTarget).get('email')).trim();
    if (!captchaToken) return setError('Please wait for the verification check to finish.');
    setLoading(true);
    setError(null);
    const { error } = await authClient.requestPasswordReset({ email, redirectTo: '/reset-password', fetchOptions: { headers: captchaHeaders(captchaToken) } });
    setLoading(false);
    resetCaptcha();
    if (error?.status === 429) return setError('Too many requests. Please try again later.');
    // Same response whether or not the account exists (no account enumeration).
    setSentTo(email);
  }

  if (sentTo) return <CheckEmail email={sentTo}>If an account exists, a reset link is on its way to</CheckEmail>;
  return (
    <form onSubmit={submit} className="grid gap-4" noValidate>
      {error && <Alert variant="destructive">{error}</Alert>}
      <Field label="Email" htmlFor="email">
        <Input id="email" name="email" type="email" required autoComplete="email" />
      </Field>
      <Turnstile siteKey={siteKey} onToken={setCaptchaToken} ref={captchaWidget} />
      <Button type="submit" loading={loading}>
        Send reset link
      </Button>
    </form>
  );
}

export function ResetPasswordForm({ token }: { token: string }) {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const newPassword = String(new FormData(event.currentTarget).get('password'));
    if (newPassword.length < 10) return setError('Password must be at least 10 characters.');
    setLoading(true);
    setError(null);
    const { error } = await authClient.resetPassword({ newPassword, token });
    setLoading(false);
    if (error) return setError('This reset link is invalid or has expired. Request a new one.');
    setDone(true);
  }

  if (done)
    return (
      <div className="grid gap-4">
        <Alert variant="success">Your password has been changed.</Alert>
        <Button asChild>
          <Link href="/login">Log in</Link>
        </Button>
      </div>
    );
  return (
    <form onSubmit={submit} className="grid gap-4" noValidate>
      {error && <Alert variant="destructive">{error}</Alert>}
      <Field label="New password" htmlFor="password" hint="At least 10 characters.">
        <Input id="password" name="password" type="password" required minLength={10} maxLength={128} autoComplete="new-password" aria-describedby="password-help" />
      </Field>
      <Button type="submit" loading={loading}>
        Change password
      </Button>
    </form>
  );
}
