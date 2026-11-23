import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { QuotationActions } from '@/components/quotations/quotation-actions';
import { Alert } from '@/components/ui/misc';
import { formatPHP } from '@/lib/money';
import { calculateQuotation, ITEM_TYPE_LABELS, type QuotationItem } from '@/lib/quotation';
import { brandingFor, loadQuotationOr404, requireQuotationUser } from '../shared';

export const metadata: Metadata = { title: 'Quotation', robots: { index: false } };

const formatDate = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' });

export default async function QuotationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user, profile } = await requireQuotationUser(`/quotations/${id}`);
  const data = await loadQuotationOr404(user.id, id);
  if (!data) notFound();
  const { row, entitlements } = data;
  const branding = brandingFor(profile, entitlements, user.email);
  const totals = calculateQuotation(row);
  const document = {
    number: row.number,
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
  };

  return (
    <div className="container-page grid max-w-4xl gap-6 py-8">
      <Link href="/quotations" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden /> All quotations
      </Link>
      <QuotationActions id={row.id} quotation={document} branding={branding} />
      {!entitlements.limits.customQuotationBranding && (
        <Alert>
          Want your logo on the PDF and no “Made with Tibay” footer?{' '}
          <Link href="/account/subscription" className="font-medium underline">
            Upgrade to Premium
          </Link>
          .
        </Alert>
      )}

      {/* On-screen preview of the document */}
      <article className="grid gap-6 rounded-lg border p-5 sm:p-8" aria-label={`Quotation ${row.number}`}>
        <header className="flex flex-col gap-4 border-b pb-6 sm:flex-row sm:justify-between">
          <div className="flex items-start gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {branding.logoUrl && <img src={branding.logoUrl} alt="" className="h-14 max-w-28 object-contain" />}
            <div>
              <p className="text-lg font-semibold">{branding.businessName}</p>
              <p className="text-sm text-muted-foreground">{[branding.addressLine, branding.phone, branding.email].filter(Boolean).join(' · ')}</p>
            </div>
          </div>
          <div className="sm:text-right">
            <p className="text-xl font-semibold tracking-wide">QUOTATION</p>
            <p className="text-sm text-muted-foreground">No. {row.number}</p>
            <p className="text-sm text-muted-foreground">Date: {formatDate(row.issueDate)}</p>
            <p className="text-sm text-muted-foreground">Valid until: {formatDate(row.validUntil)}</p>
          </div>
        </header>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Prepared for</p>
            <p className="font-semibold">{row.clientName}</p>
            {row.clientAddress && <p className="text-sm text-muted-foreground">{row.clientAddress}</p>}
            {row.clientContact && <p className="text-sm text-muted-foreground">{row.clientContact}</p>}
          </div>
          {row.title && (
            <div className="sm:text-right">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Project</p>
              <p className="font-medium">{row.title}</p>
            </div>
          )}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[30rem] text-sm">
            <thead>
              <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th scope="col" className="py-2 pr-3 font-medium">Description</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">Qty</th>
                <th scope="col" className="px-3 py-2 font-medium">Unit</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">Unit price</th>
                <th scope="col" className="py-2 pl-3 text-right font-medium">Amount</th>
              </tr>
            </thead>
            {(Object.keys(ITEM_TYPE_LABELS) as QuotationItem['type'][]).map((type) => {
              const items = row.items.map((item, index) => ({ item, total: totals.lineTotals[index] ?? 0, index })).filter((r) => r.item.type === type);
              if (!items.length) return null;
              return (
                <tbody key={type}>
                  <tr>
                    <th scope="colgroup" colSpan={5} className="bg-subtle px-2 py-1.5 text-left text-xs font-semibold uppercase tracking-wide">
                      {ITEM_TYPE_LABELS[type]}
                    </th>
                  </tr>
                  {items.map(({ item, total, index }) => (
                    <tr key={index} className="border-b tabular-nums">
                      <td className="py-2 pr-3">{item.description}</td>
                      <td className="px-3 py-2 text-right">{item.quantity}</td>
                      <td className="px-3 py-2">{item.unit}</td>
                      <td className="px-3 py-2 text-right">{formatPHP(item.unitPrice)}</td>
                      <td className="py-2 pl-3 text-right">{formatPHP(total)}</td>
                    </tr>
                  ))}
                </tbody>
              );
            })}
          </table>
        </div>
        <dl className="ml-auto grid w-full max-w-xs gap-1.5 text-sm tabular-nums">
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Subtotal</dt>
            <dd>{formatPHP(totals.subtotal)}</dd>
          </div>
          {totals.discountAmount > 0 && (
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Discount{row.discountType === 'percent' ? ` (${row.discountValue / 100}%)` : ''}</dt>
              <dd>− {formatPHP(totals.discountAmount)}</dd>
            </div>
          )}
          {row.taxRateBps > 0 && (
            <div className="flex justify-between">
              <dt className="text-muted-foreground">VAT / Tax ({row.taxRateBps / 100}%)</dt>
              <dd>{formatPHP(totals.taxAmount)}</dd>
            </div>
          )}
          <div className="mt-1 flex justify-between border-t border-foreground pt-2 text-base font-semibold">
            <dt>Total</dt>
            <dd>{formatPHP(totals.total)}</dd>
          </div>
        </dl>
        {(row.paymentTerms || row.notes) && (
          <footer className="grid gap-4 border-t pt-6 text-sm">
            {row.paymentTerms && (
              <div>
                <p className="font-medium">Payment terms</p>
                <p className="whitespace-pre-line text-muted-foreground">{row.paymentTerms}</p>
              </div>
            )}
            {row.notes && (
              <div>
                <p className="font-medium">Notes</p>
                <p className="whitespace-pre-line text-muted-foreground">{row.notes}</p>
              </div>
            )}
          </footer>
        )}
      </article>
    </div>
  );
}
