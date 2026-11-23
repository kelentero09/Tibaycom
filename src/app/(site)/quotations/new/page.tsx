import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { QuotationBuilder } from '@/components/quotations/quotation-builder';
import { PageHeader } from '@/components/ui/misc';
import { getEntitlements } from '@/server/entitlements';
import { getQuotaUsage } from '@/server/quotations';
import { requireQuotationUser, todayInManila } from '../shared';

export const metadata: Metadata = { title: 'New quotation', robots: { index: false } };

export default async function NewQuotationPage() {
  const { user } = await requireQuotationUser('/quotations/new');
  const [entitlements, used] = await Promise.all([getEntitlements(user.id), getQuotaUsage(user.id)]);
  if (used >= entitlements.limits.quotationsPerMonth) redirect('/quotations');
  return (
    <div className="container-page grid gap-6 py-8">
      <PageHeader title="New quotation" description="Totals update as you type. You can edit it after saving." />
      <QuotationBuilder mode="create" today={todayInManila()} />
    </div>
  );
}
