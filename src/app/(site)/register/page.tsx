import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { RegisterForm } from '@/components/auth-forms';
import { getSession } from '@/server/auth';
import { getEnv } from '@/server/db';
import { AuthCard } from '../auth-card';

export const metadata: Metadata = { title: 'Create your free profile', description: 'Join Tibay for free: publish your construction portfolio and send professional quotations.' };

export default async function RegisterPage() {
  if (await getSession()) redirect('/onboarding');
  return (
    <AuthCard title="Create your free profile" description="Showcase your projects and get found by clients. No credit card needed.">
      <RegisterForm siteKey={getEnv().TURNSTILE_SITE_KEY} />
    </AuthCard>
  );
}
