import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { RegisterForm } from '@/components/auth-forms';
import { getSession, socialProviders } from '@/server/auth';
import { getT } from '@/server/locale';
import { getEnv } from '@/server/db';
import { AuthCard } from '../auth-card';

export const metadata: Metadata = { title: 'Create your free profile', description: 'Join Tibay for free: publish your construction portfolio and send professional quotations.' };

export default async function RegisterPage() {
  if (await getSession()) redirect('/onboarding');
  const t = await getT();
  return (
    <AuthCard title={t.auth.registerTitle} description={t.auth.registerSubtitle}>
      <RegisterForm siteKey={getEnv().TURNSTILE_SITE_KEY} labels={t.auth} social={socialProviders()} />
    </AuthCard>
  );
}
