import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { QuotationBuilder } from '@/components/quotations/quotation-builder';
import { PageHeader } from '@/components/ui/misc';
import { loadQuotationOr404, requireQuotationUser, todayInManila } from '../../shared';

export const metadata: Metadata = { title: 'Edit quotation', robots: { index: false } };

export default async function EditQuotationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user } = await requireQuotationUser(`/quotations/${id}/edit`);
  const data = await loadQuotationOr404(user.id, id);
  if (!data) notFound();
  const { row } = data;
  return (
    <div className="container-page grid gap-6 py-8">
      <PageHeader title={`Edit ${row.number}`} />
      <QuotationBuilder
        mode="edit"
        id={row.id}
        today={todayInManila()}
        initial={{
          title: row.title,
          clientName: row.clientName,
          clientAddress: row.clientAddress,
          clientContact: row.clientContact,
          issueDate: row.issueDate,
          validUntil: row.validUntil,
          items: row.items,
          discountType: row.discountType,
          discountValue: row.discountValue,
          taxRateBps: row.taxRateBps,
          paymentTerms: row.paymentTerms,
          notes: row.notes,
        }}
      />
    </div>
  );
}
