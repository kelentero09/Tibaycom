import type { Metadata } from 'next';
import { ChangePasswordCard, DeleteAccountCard, TwoFactorCard } from '@/components/account/security-settings';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/misc';
import { isAdmin, requireUser } from '@/server/auth';

export const metadata: Metadata = { title: 'Account settings', robots: { index: false } };

export default async function SecurityPage({ searchParams }: { searchParams: Promise<{ required?: string }> }) {
  const user = await requireUser('/account/security');
  const { required } = await searchParams;
  return (
    <div className="container-page grid max-w-3xl gap-6 py-8">
      <PageHeader title="Account settings" description="Sign-in, security and your data." />
      <Card>
        <CardHeader>
          <CardTitle>Account</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-1 text-sm">
          <p>
            <span className="text-muted-foreground">Name:</span> {user.name}
          </p>
          <p>
            <span className="text-muted-foreground">Email:</span> {user.email}
          </p>
        </CardContent>
      </Card>
      <TwoFactorCard enabled={!!user.twoFactorEnabled} required={required === '2fa' || isAdmin(user)} />
      <ChangePasswordCard />
      {!isAdmin(user) && <DeleteAccountCard />}
    </div>
  );
}
