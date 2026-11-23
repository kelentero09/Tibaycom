import 'server-only';
import { cache } from 'react';
import { cookies } from 'next/headers';
import { getDictionary, isLocale, LOCALE_COOKIE, type Locale } from '@/lib/i18n';

/** Language chosen with the header toggle (cookie). English by default. */
export const getLocale = cache(async (): Promise<Locale> => {
  const value = (await cookies()).get(LOCALE_COOKIE)?.value;
  return isLocale(value) ? value : 'en';
});

export const getT = cache(async () => getDictionary(await getLocale()));
