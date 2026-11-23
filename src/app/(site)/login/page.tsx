import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { LoginForm } from '@/components/auth-forms';
import { getSession, socialProviders } from '@/server/auth';
import { getT } from '@/server/locale';
import { getEnv } from '@/server/db';
import { AuthCard } from '../auth-card';

export const metadata: Metadata = { title: 'Log in', robots: { index: false } };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const { next, error } = await searchParams;
  const t = await getT();
  if (await getSession()) redirect('/onboarding');
  return (
    <AuthCard title={t.auth.loginTitle} description={t.auth.loginSubtitle}>
      <LoginForm siteKey={getEnv().TURNSTILE_SITE_KEY} next={next} labels={t.auth} social={socialProviders()} socialError={!!error} />
    </AuthCard>
  );
}
