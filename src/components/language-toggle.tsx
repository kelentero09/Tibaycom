'use client';

import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { Languages } from 'lucide-react';
import { LOCALE_COOKIE, type Locale } from '@/lib/i18n';

/** Switches between English and Filipino. `label` is the name of the OTHER language, in that language. */
export function LanguageToggle({ locale, label }: { locale: Locale; label: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const next: Locale = locale === 'en' ? 'fil' : 'en';
  return (
    <button
      type="button"
      lang={next === 'fil' ? 'fil' : 'en'}
      disabled={pending}
      onClick={() => {
        document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
        startTransition(() => router.refresh());
      }}
      className="inline-flex h-9 items-center gap-1.5 rounded-md px-2.5 text-sm text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-60"
      aria-label={`Switch language to ${label}`}
    >
      <Languages className="size-4" aria-hidden />
      <span>{label}</span>
    </button>
  );
}
