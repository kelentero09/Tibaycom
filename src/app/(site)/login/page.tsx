import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { LoginForm } from '@/components/auth-forms';
import { getSession } from '@/server/auth';
import { getEnv } from '@/server/db';
import { AuthCard } from '../auth-card';

export const metadata: Metadata = { title: 'Log in', robots: { index: false } };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  if (await getSession()) redirect('/onboarding');
  return (
    <AuthCard title="Welcome back" description="Log in to manage your profile and quotations.">
      <LoginForm siteKey={getEnv().TURNSTILE_SITE_KEY} next={next} />
    </AuthCard>
  );
}
