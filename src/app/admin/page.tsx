import Link from 'next/link';
import { PeriodBarChart, PeriodLineChart, RankedBars, SplitBar } from '@/components/admin/charts';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/form';
import { PageHeader } from '@/components/ui/misc';
import { formatPHP } from '@/lib/money';
import { professionLabel } from '@/lib/professions';
import { getAnalytics, getOverview, parseRange } from '@/server/admin/metrics';
import { requireAdmin } from '@/server/auth';

export const metadata = { title: 'Overview' };

const percent = (value: number) => `${(value * 100).toFixed(1)}%`;
const count = (value: number) => value.toLocaleString('en-PH');

function Stat({ label, value, hint, href }: { label: string; value: string; hint?: string; href?: string }) {
  const body = (
    <div className="grid h-full content-start gap-1 rounded-lg border bg-background p-4">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="text-2xl font-semibold tabular-nums">{value}</p>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
  return href ? (
    <Link href={href} className="rounded-lg hover:[&>div]:border-foreground/30">
      {body}
    </Link>
  ) : (
    body
  );
}

function StatGroup({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <section className="grid gap-3">
      <div>
        <h2 className="font-semibold">{title}</h2>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{children}</div>
    </section>
  );
}

export default async function AdminOverviewPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  await requireAdmin();
  const params = await searchParams;
  const range = parseRange(params.from, params.to);
  const [overview, analytics] = await Promise.all([getOverview(range), getAnalytics(range)]);
  const { users, subscriptions, recurring, collections } = overview;
  const intervalCount = (name: string) => analytics.intervals.find((i) => i.interval === name)?.count ?? 0;
  const rangeLabel = `${range.fromInput} to ${range.toInput}`;

  return (
    <div className="grid gap-8">
      <PageHeader title="Overview" description="Live figures from the database. Dates are in Philippine time." />

      {/* One filter row above everything it scopes */}
      <form method="get" className="flex flex-wrap items-end gap-3 rounded-lg border bg-background p-4">
        <label className="grid gap-1 text-xs font-medium text-muted-foreground">
          From
          <Input type="date" name="from" defaultValue={range.fromInput} max={range.toInput} className="h-10" />
        </label>
        <label className="grid gap-1 text-xs font-medium text-muted-foreground">
          To
          <Input type="date" name="to" defaultValue={range.toInput} className="h-10" />
        </label>
        <Button type="submit" size="sm" className="h-10">
          Apply
        </Button>
        <Button asChild variant="ghost" size="sm" className="h-10">
          <Link href="/admin">Last 30 days</Link>
        </Button>
        <p className="w-full text-xs text-muted-foreground">Applies to “in range” figures and the charts. Totals, MRR/ARR and rates are always current.</p>
      </form>

      <StatGroup title="Users">
        <Stat label="Total registered users" value={count(users.total)} href="/admin/users" />
        <Stat label="New registrations" value={count(users.newInRange)} hint={rangeLabel} />
        <Stat label="Premium users" value={count(users.premium)} hint={`${count(users.free)} on Free`} href="/admin/users?status=premium" />
        <Stat label="Conversion rate" value={percent(overview.conversionRate)} hint="Premium ÷ all users" />
      </StatGroup>

      <StatGroup title="Subscriptions">
        <Stat label="Active subscriptions" value={count(subscriptions.active)} href="/admin/subscriptions?status=active" />
        <Stat label="Expired subscriptions" value={count(subscriptions.expired)} href="/admin/subscriptions?status=expired" />
        <Stat label="Upcoming renewals" value={count(subscriptions.upcomingRenewals)} hint="Ending within 14 days" />
        <Stat label="Churn rate (30 days)" value={percent(overview.churnRate)} hint="Lapsed ÷ active at window start" />
      </StatGroup>

      <StatGroup title="Recurring revenue" description="Run-rate from currently active subscriptions — not cash received. Annual plans are counted at 1/12 per month.">
        <Stat label="MRR" value={formatPHP(recurring.mrr)} hint="Monthly recurring revenue" />
        <Stat label="ARR" value={formatPHP(recurring.arr)} hint="MRR × 12" />
      </StatGroup>

      <StatGroup title="Collections" description="Actual payments received through PayMongo.">
        <Stat label="Collected this month" value={formatPHP(collections.month)} />
        <Stat label="Lifetime collected" value={formatPHP(collections.lifetime)} hint={`Net ${formatPHP(collections.lifetimeNet)}`} href="/admin/transactions?status=paid" />
        <Stat label="Collected in range" value={formatPHP(collections.range)} hint={rangeLabel} />
        <Stat label="Net collections in range" value={formatPHP(collections.net)} hint="Collected − fees − refunds" />
        <Stat label="Payment fees in range" value={formatPHP(collections.fees)} />
        <Stat label="Refunds in range" value={formatPHP(collections.refunds)} href="/admin/transactions?status=refunded" />
        <Stat label="Failed payments in range" value={count(overview.failedPayments)} href="/admin/transactions?status=failed" />
      </StatGroup>

      <section className="grid gap-4 lg:grid-cols-2" aria-label="Analytics">
        <Card>
          <CardHeader>
            <CardTitle>Revenue collected</CardTitle>
            <CardDescription>Gross payments per {analytics.granularity}, {rangeLabel}</CardDescription>
          </CardHeader>
          <CardContent>
            <PeriodBarChart data={analytics.revenue.map((r) => ({ bucket: r.bucket, value: r.gross, secondary: r.net }))} granularity={analytics.granularity} kind="money" label="Collected" secondaryLabel="Net of fees & refunds" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>New registrations</CardTitle>
            <CardDescription>Accounts created per {analytics.granularity}, {rangeLabel}</CardDescription>
          </CardHeader>
          <CardContent>
            <PeriodLineChart data={analytics.registrations.map((r) => ({ bucket: r.bucket, value: r.count }))} granularity={analytics.granularity} kind="count" label="Registrations" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Free vs. Premium</CardTitle>
            <CardDescription>All registered users, right now</CardDescription>
          </CardHeader>
          <CardContent>
            <SplitBar a={{ label: 'Free', value: users.free }} b={{ label: 'Premium', value: users.premium }} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Monthly vs. annual</CardTitle>
            <CardDescription>Active subscriptions by billing period</CardDescription>
          </CardHeader>
          <CardContent>
            <SplitBar a={{ label: 'Monthly', value: intervalCount('monthly') }} b={{ label: 'Annual', value: intervalCount('annual') }} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Profiles by profession</CardTitle>
            <CardDescription>Top 10. A profile can list several professions.</CardDescription>
          </CardHeader>
          <CardContent>
            <RankedBars items={analytics.professions.map((p) => ({ name: professionLabel(p.name), count: p.count }))} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Profiles by province</CardTitle>
            <CardDescription>Top 10 locations</CardDescription>
          </CardHeader>
          <CardContent>
            <RankedBars items={analytics.provinces} />
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
