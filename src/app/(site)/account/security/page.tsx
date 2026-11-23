import type { Metadata } from 'next';
import { ChangePasswordCard, DeleteAccountCard, TwoFactorCard } from '@/components/account/security-settings';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/misc';
import { and, eq } from 'drizzle-orm';
import { isAdmin, requireUser } from '@/server/auth';
import { getDb, schema } from '@/server/db';

export const metadata: Metadata = { title: 'Account settings', robots: { index: false } };

export default async function SecurityPage({ searchParams }: { searchParams: Promise<{ required?: string }> }) {
  const user = await requireUser('/account/security');
  const { required } = await searchParams;
  const accounts = await getDb().select({ provider: schema.account.providerId }).from(schema.account).where(and(eq(schema.account.userId, user.id)));
  const hasPassword = accounts.some((a) => a.provider === 'credential');
  const socialNames = accounts.filter((a) => a.provider !== 'credential').map((a) => a.provider.charAt(0).toUpperCase() + a.provider.slice(1));
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
          <p>
            <span className="text-muted-foreground">Sign-in:</span> {[hasPassword ? 'Email and password' : null, ...socialNames].filter(Boolean).join(' · ')}
          </p>
        </CardContent>
      </Card>
      {hasPassword ? (
        <>
          <TwoFactorCard enabled={!!user.twoFactorEnabled} required={required === '2fa' || isAdmin(user)} />
          <ChangePasswordCard />
        </>
      ) : (
        <Card>
          <CardContent className="text-sm leading-relaxed text-muted-foreground">
            You sign in with {socialNames.join(' / ') || 'a social account'}, so there is no Tibay password to manage. Your account is protected by that provider’s security, including its two-step verification.
          </CardContent>
        </Card>
      )}
      {!isAdmin(user) && <DeleteAccountCard hasPassword={hasPassword} />}
    </div>
  );
}
