import type { Metadata } from 'next';
import Link from 'next/link';
import { ResetPasswordForm } from '@/components/auth-forms';
import { Alert } from '@/components/ui/misc';
import { AuthCard } from '../auth-card';

export const metadata: Metadata = { title: 'Reset password', robots: { index: false }, referrer: 'no-referrer' };

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  return (
    <AuthCard title="Choose a new password" description="You will be signed out of all devices after changing it.">
      {token ? (
        <ResetPasswordForm token={token} />
      ) : (
        <Alert variant="destructive">
          This reset link is invalid or has expired. <Link href="/forgot-password" className="underline">Request a new one</Link>.
        </Alert>
      )}
    </AuthCard>
  );
}
