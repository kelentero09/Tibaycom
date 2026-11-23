import type { Metadata } from 'next';
import Link from 'next/link';
import { FileText, Lock, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Alert, EmptyState, PageHeader } from '@/components/ui/misc';
import { formatPHP } from '@/lib/money';
import { listQuotations } from '@/server/quotations';
import { requireQuotationUser } from './shared';

export const metadata: Metadata = { title: 'Quotations', robots: { index: false } };

const formatDate = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' });

export default async function QuotationsPage() {
  const { user } = await requireQuotationUser('/quotations');
  const { rows, used, entitlements, lockedCount } = await listQuotations(user.id);
  const limit = entitlements.limits.quotationsPerMonth;
  const remaining = Math.max(0, limit - used);

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
      <PageHeader title="Quotations" description={`${used} of ${limit} used this month · ${entitlements.plan === 'premium' ? 'Premium' : 'Free plan'}`} actions={newButton} />
      <div className="h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-label="Monthly quotation usage" aria-valuemin={0} aria-valuemax={limit} aria-valuenow={Math.min(used, limit)}>
        <div className={`h-full rounded-full ${remaining === 0 ? 'bg-destructive' : 'bg-primary'}`} style={{ width: `${limit ? Math.min(100, (used / limit) * 100) : 100}%` }} />
      </div>
      {remaining === 0 && <Alert variant="warning">You have used all {limit} quotations for this month. Your quota resets on the 1st, or upgrade for more.</Alert>}

      {rows.length === 0 ? (
        <EmptyState icon={<FileText />} title="No quotations yet" description="Create a professional quotation with automatic totals and download it as a PDF." action={remaining > 0 ? newButton : undefined} />
      ) : (
        <ul className="grid gap-3">
          {rows.map((q) => (
            <li key={q.id}>
              <Link href={`/quotations/${q.id}`} className="flex items-center justify-between gap-4 rounded-lg border p-4 hover:border-foreground/30">
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
        <div className="flex flex-col items-start gap-3 rounded-lg border border-dashed p-5 sm:flex-row sm:items-center sm:justify-between">
          <p className="flex items-start gap-2.5 text-sm text-muted-foreground">
            <Lock className="mt-0.5 size-4 shrink-0" aria-hidden />
            <span>
              <span className="font-medium text-foreground">
                {lockedCount} older quotation{lockedCount === 1 ? '' : 's'} saved.
              </span>{' '}
              Quotation history is a Premium feature — upgrade to open, edit and duplicate past quotations.
            </span>
          </p>
          <Button asChild variant="outline" size="sm">
            <Link href="/account/subscription">Unlock history</Link>
          </Button>
        </div>
      )}
    </div>
  );
}
