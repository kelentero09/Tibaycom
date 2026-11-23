'use client';

import { useRef, useState } from 'react';
import { api, errorMessage } from '@/lib/api-client';
import { Turnstile, type TurnstileHandle } from './turnstile';
import { Button } from './ui/button';
import { Field, Input, Textarea } from './ui/form';
import { Alert } from './ui/misc';

export function ContactForm({ siteKey }: { siteKey: string }) {
  const [token, setToken] = useState<string | null>(null);
  const captcha = useRef<TurnstileHandle>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) return setError('Please wait for the verification check to finish.');
    const form = new FormData(event.currentTarget);
    setLoading(true);
    setError(null);
    try {
      await api('/api/contact', { method: 'POST', body: { name: form.get('name'), email: form.get('email'), message: form.get('message'), turnstileToken: token } });
      setSent(true);
    } catch (err) {
      setError(errorMessage(err));
      captcha.current?.reset();
    } finally {
      setLoading(false);
    }
  }

  if (sent) return <Alert variant="success">Thanks — your message was sent. We usually reply within two business days.</Alert>;
  return (
    <form onSubmit={submit} className="grid gap-4" noValidate>
      {error && <Alert variant="destructive">{error}</Alert>}
      <Field label="Name" htmlFor="ct-name" required>
        <Input id="ct-name" name="name" required maxLength={80} autoComplete="name" />
      </Field>
      <Field label="Email" htmlFor="ct-email" required>
        <Input id="ct-email" name="email" type="email" required maxLength={120} autoComplete="email" />
      </Field>
      <Field label="Message" htmlFor="ct-message" required>
        <Textarea id="ct-message" name="message" required rows={6} maxLength={2000} />
      </Field>
      <Turnstile siteKey={siteKey} onToken={setToken} ref={captcha} />
      <Button type="submit" loading={loading}>
        Send message
      </Button>
    </form>
  );
}
