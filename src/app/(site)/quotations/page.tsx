import type { Metadata } from 'next';
import Link from 'next/link';
import { FileText, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmptyState, PageHeader } from '@/components/ui/misc';
import { UpgradeBanner } from '@/components/upgrade-prompt';
import { formatPHP } from '@/lib/money';
import { listQuotations } from '@/server/quotations';
import { requireQuotationUser } from './shared';

export const metadata: Metadata = { title: 'Quotations', robots: { index: false } };

const formatDate = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' });

export default async function QuotationsPage() {
  const { user } = await requireQuotationUser('/quotations');
  const { rows, used, entitlements, lockedCount } = await listQuotations(user.id);
  const limit = entitlements.limits.quotationsPerMonth;
  const unlimited = limit === null;
  const remaining = unlimited ? Number.POSITIVE_INFINITY : Math.max(0, limit - used);

  const newButton =
    remaining > 0 ? (
      <Button asChild>
        <Link href="/quotations/new">
          <Plus aria-hidden /> New quotation
        </Link>
      </Button>
    ) : (
      <Button asChild variant="accent">
        <Link href="/account/subscription">Upgrade for more</Link>
      </Button>
    );

  return (
    <div className="container-page grid gap-6 py-8">
      <PageHeader title="Quotations" description={`${unlimited ? `${used} created this month · Unlimited` : `${used} of ${limit} used this month`} · ${entitlements.plan === 'premium' ? 'Premium' : 'Free plan'}`} actions={newButton} />
      {!unlimited && (
        <div className="h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-label="Monthly quotation usage" aria-valuemin={0} aria-valuemax={limit} aria-valuenow={Math.min(used, limit)}>
          <div className={`h-full rounded-full transition-[width] duration-500 ${remaining === 0 ? 'bg-destructive' : 'bg-primary'}`} style={{ width: `${limit ? Math.min(100, (used / limit) * 100) : 100}%` }} />
        </div>
      )}
      {remaining === 0 ? (
        <UpgradeBanner
          title={`You’ve used all ${limit} quotations this month.`}
          body={entitlements.plan === 'free' ? 'Don’t keep a client waiting until the 1st — Premium gives you unlimited quotations.' : 'Your quota resets on the 1st of next month.'}
          cta={entitlements.plan === 'free' ? 'Get unlimited quotations' : 'View plan'}
        />
      ) : entitlements.plan === 'free' && remaining === 1 ? (
        <UpgradeBanner tone="neutral" title="1 quotation left this month." body="Premium gives you unlimited quotations, with your logo on each one." />
      ) : null}

      {rows.length === 0 ? (
        <EmptyState icon={<FileText />} title="No quotations yet" description="Create a professional quotation with automatic totals and download it as a PDF." action={remaining > 0 ? newButton : undefined} />
      ) : (
        <ul className="grid gap-3">
          {rows.map((q, index) => (
            <li key={q.id} className="stagger" style={{ '--i': index } as React.CSSProperties}>
              <Link href={`/quotations/${q.id}`} className="card-interactive flex items-center justify-between gap-4 rounded-xl border bg-background p-4">
                <div className="grid min-w-0 gap-0.5">
                  <p className="truncate font-medium">{q.clientName}</p>
                  <p className="truncate text-sm text-muted-foreground">
                    {q.number}
                    {q.title ? ` · ${q.title}` : ''} · {formatDate(q.issueDate)}
                  </p>
                </div>
                <p className="shrink-0 font-semibold tabular-nums">{formatPHP(q.total)}</p>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {lockedCount > 0 && (
        <UpgradeBanner
          tone="neutral"
          title={`${lockedCount} older quotation${lockedCount === 1 ? ' is' : 's are'} saved and waiting.`}
          body="Premium unlocks your full history — reopen, edit and reuse any past quotation instead of typing it again."
          cta="Unlock history"
        />
      )}
    </div>
  );
}
