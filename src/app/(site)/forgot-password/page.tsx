import type { Metadata } from 'next';
import { ForgotPasswordForm } from '@/components/auth-forms';
import { getEnv } from '@/server/db';
import { AuthCard } from '../auth-card';

export const metadata: Metadata = { title: 'Forgot password', robots: { index: false } };

export default function ForgotPasswordPage() {
  return (
    <AuthCard title="Forgot your password?" description="Enter your email and we will send you a link to choose a new one.">
      <ForgotPasswordForm siteKey={getEnv().TURNSTILE_SITE_KEY} />
    </AuthCard>
  );
}
