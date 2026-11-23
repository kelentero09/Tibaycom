'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { authClient } from '@/lib/auth-client';
import { Button } from './ui/button';

type Props = { providers: { google: boolean; facebook: boolean }; labels: { google: string; facebook: string; or: string }; next?: string };

const GoogleMark = () => (
  <svg viewBox="0 0 24 24" className="size-4.5" aria-hidden>
    <path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5a5.5 5.5 0 0 1-2.4 3.6v3h3.9c2.3-2.1 3.5-5.2 3.5-8.8Z" />
    <path fill="#34A853" d="M12 24c3.2 0 6-1.1 8-2.9l-3.9-3c-1.1.7-2.5 1.2-4.1 1.2-3.1 0-5.8-2.1-6.7-5H1.3v3.1A12 12 0 0 0 12 24Z" />
    <path fill="#FBBC05" d="M5.3 14.3a7.2 7.2 0 0 1 0-4.6V6.6H1.3a12 12 0 0 0 0 10.8l4-3.1Z" />
    <path fill="#EA4335" d="M12 4.8c1.8 0 3.3.6 4.6 1.8l3.4-3.4A12 12 0 0 0 1.3 6.6l4 3.1c.9-2.9 3.6-4.9 6.7-4.9Z" />
  </svg>
);

const FacebookMark = () => (
  <svg viewBox="0 0 24 24" className="size-4.5" aria-hidden>
    <path fill="#1877F2" d="M24 12a12 12 0 1 0-13.9 11.9v-8.4H7.1V12h3V9.4c0-3 1.8-4.700 4.500-4.700 1.300 0 2.700.2 2.700.2v3h-1.500c-1.500 0-2 .9-2 1.900V12h3.400l-.5 3.500h-2.900v8.400A12 12 0 0 0 24 12Z" />
  </svg>
);

/**
 * One-tap sign-in / sign-up. No email verification step is needed because the provider has already
 * verified the address. Rendered only for providers whose credentials are configured on the server.
 */
export function SocialButtons({ providers, labels, next }: Props) {
  const [busy, setBusy] = useState<'google' | 'facebook' | null>(null);
  if (!providers.google && !providers.facebook) return null;

  async function start(provider: 'google' | 'facebook') {
    setBusy(provider);
    const { error } = await authClient.signIn.social({ provider, callbackURL: next ?? '/onboarding', errorCallbackURL: '/login?error=social' });
    if (error) {
      setBusy(null);
      toast.error('Could not start sign-in. Please try again.');
    }
    // On success the browser is redirected to the provider.
  }

  return (
    <div className="grid gap-4">
      <div className="grid gap-2">
        {providers.google && (
          <Button variant="outline" size="lg" className="text-sm" loading={busy === 'google'} disabled={busy !== null} onClick={() => void start('google')}>
            {busy !== 'google' && <GoogleMark />} {labels.google}
          </Button>
        )}
        {providers.facebook && (
          <Button variant="outline" size="lg" className="text-sm" loading={busy === 'facebook'} disabled={busy !== null} onClick={() => void start('facebook')}>
            {busy !== 'facebook' && <FacebookMark />} {labels.facebook}
          </Button>
        )}
      </div>
      <div className="flex items-center gap-3 text-xs text-muted-foreground" role="separator">
        <span className="h-px flex-1 bg-border" />
        {labels.or}
        <span className="h-px flex-1 bg-border" />
      </div>
    </div>
  );
}
