import type { Metadata } from 'next';
import { desc, eq } from 'drizzle-orm';
import { SubscriptionPanel } from '@/components/account/subscription-panel';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, Badge, PageHeader, type BadgeVariant } from '@/components/ui/misc';
import { formatPHP } from '@/lib/money';
import { requireUser } from '@/server/auth';
import { getDb, schema } from '@/server/db';
import { getEntitlements, getPlanConfig } from '@/server/entitlements';

export const metadata: Metadata = { title: 'Subscription', robots: { index: false } };

const formatDate = (date: Date) => date.toLocaleDateString('en-PH', { timeZone: 'Asia/Manila', year: 'numeric', month: 'long', day: 'numeric' });
const daysUntil = (date: Date) => Math.ceil((date.getTime() - Date.now()) / 86_400_000);
const statusBadge: Record<string, BadgeVariant> = { paid: 'success', pending: 'warning', failed: 'destructive', expired: 'outline', refunded: 'neutral' };

type Props = { searchParams: Promise<{ payment?: string; cancelled?: string; reason?: string }> };

export default async function SubscriptionPage({ searchParams }: Props) {
  const user = await requireUser('/account/subscription');
  const params = await searchParams;
  const [entitlements, config, history] = await Promise.all([
    getEntitlements(user.id),
    getPlanConfig(),
    getDb().select().from(schema.payments).where(eq(schema.payments.userId, user.id)).orderBy(desc(schema.payments.createdAt)).limit(12),
  ]);
  const { plan, subscription, limits } = entitlements;
  const isPremium = plan === 'premium';
  const daysLeft = subscription && isPremium ? daysUntil(subscription.currentPeriodEnd) : 0;
  const returningPaymentId = params.payment && /^[0-9a-f-]{36}$/.test(params.payment) ? params.payment : null;

  return (
    <div className="container-page grid max-w-3xl gap-6 py-8">
      <PageHeader title="Subscription" description="Manage your Tibay plan and payments." />
      {params.reason === 'history' && <Alert variant="warning">Quotation history is a Premium feature. Upgrade to open quotations from previous months.</Alert>}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            Current plan <Badge variant={isPremium ? 'accent' : 'outline'}>{isPremium ? 'Premium' : 'Free'}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-5">
          {isPremium && subscription ? (
            <p className="text-sm text-muted-foreground">
              Premium is active until <span className="font-medium text-foreground">{formatDate(subscription.currentPeriodEnd)}</span> ({daysLeft} day{daysLeft === 1 ? '' : 's'} left). It does not renew automatically.
            </p>
          ) : subscription ? (
            <p className="text-sm text-muted-foreground">
              Your Premium {subscription.status === 'revoked' ? 'was refunded' : `ended on ${formatDate(subscription.currentPeriodEnd)}`}. Your content is safe — renew to show everything again.
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">
              You are on the Free plan: {limits.projects} projects, {limits.photosPerProject} photos per project and {limits.quotationsPerMonth === null ? 'unlimited' : limits.quotationsPerMonth} quotations per month, {limits.updatesPerProject} timeline updates per project and {limits.postsPerDay === null ? 'unlimited' : limits.postsPerDay} community posts per day.
            </p>
          )}
          <SubscriptionPanel pricing={config.pricing} isPremium={isPremium} cancelAtPeriodEnd={subscription?.cancelAtPeriodEnd ?? false} returningPaymentId={returningPaymentId} cancelledCheckout={!!params.cancelled} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Payment history</CardTitle>
        </CardHeader>
        <CardContent>
          {history.length === 0 ? (
            <p className="text-sm text-muted-foreground">No payments yet.</p>
          ) : (
            <ul className="divide-y text-sm">
              {history.map((payment) => (
                <li key={payment.id} className="flex items-center justify-between gap-3 py-3">
                  <div>
                    <p className="font-medium">Premium — {payment.interval === 'annual' ? '1 year' : '1 month'}</p>
                    <p className="text-muted-foreground">{formatDate(payment.paidAt ?? payment.createdAt)}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge variant={statusBadge[payment.status]}>{payment.status}</Badge>
                    <span className="tabular-nums">{formatPHP(payment.amount)}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
