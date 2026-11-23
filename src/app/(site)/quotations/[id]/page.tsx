import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { QuotationActions } from '@/components/quotations/quotation-actions';
import { QuotationDocumentView } from '@/components/quotations/quotation-document';
import { UpgradeBanner } from '@/components/upgrade-prompt';
import { getEnv } from '@/server/db';
import { getQuotaUsage } from '@/server/quotations';
import { brandingFor, loadQuotationOr404, requireQuotationUser, toDocument } from '../shared';

export const metadata: Metadata = { title: 'Quotation', robots: { index: false } };

export default async function QuotationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user, profile } = await requireQuotationUser(`/quotations/${id}`);
  const data = await loadQuotationOr404(user.id, id);
  if (!data) notFound();
  const { row, entitlements } = data;
  const branding = brandingFor(profile, entitlements, user.email);
  const document = toDocument(row);
  const limit = entitlements.limits.quotationsPerMonth;
  const remaining = limit === null ? Number.POSITIVE_INFINITY : Math.max(0, limit - (await getQuotaUsage(user.id)));

  return (
    <div className="container-page grid max-w-4xl gap-6 py-8">
      <Link href="/quotations" className="inline-flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden /> All quotations
      </Link>
      <QuotationActions id={row.id} quotation={document} branding={branding} siteUrl={getEnv().PUBLIC_SITE_URL} shareToken={row.shareToken} />

      {/* Prompts appear at the moment they matter: quota nearly used, or branding the client will notice. */}
      {entitlements.plan === 'free' && remaining === 0 ? (
        <UpgradeBanner title={`That was your last quotation this month (${limit} of ${limit}).`} body="Premium gives you unlimited quotations, so you never have to keep a client waiting." cta="Get unlimited quotations" />
      ) : entitlements.plan === 'free' && remaining === 1 ? (
        <UpgradeBanner tone="neutral" title="1 quotation left this month." body="Premium gives you unlimited quotations." />
      ) : !entitlements.limits.customQuotationBranding ? (
        <UpgradeBanner tone="neutral" title="Want your logo on this quotation?" body="Premium adds your logo and removes the “Made with Tibay” footer." />
      ) : null}

      <QuotationDocumentView document={document} branding={branding} />
    </div>
  );
}
