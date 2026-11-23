import { formatPHP } from '@/lib/money';
import { calculateQuotation, ITEM_TYPE_LABELS, type QuotationItem } from '@/lib/quotation';
import type { QuotationBranding, QuotationDocument } from '@/lib/quotation-pdf';

const formatDate = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' });

/**
 * The on-screen quotation. One component renders it for the owner's preview and for the client's
 * shared link, so both always show exactly the same document (and the same figures as the PDF).
 */
export function QuotationDocumentView({ document, branding }: { document: QuotationDocument; branding: QuotationBranding }) {
  const totals = calculateQuotation(document);
  return (
    <article className="grid gap-6 rounded-xl border bg-background p-5 shadow-card sm:p-8" aria-label={`Quotation ${document.number}`}>
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
          <p className="text-sm text-muted-foreground">No. {document.number}</p>
          <p className="text-sm text-muted-foreground">Date: {formatDate(document.issueDate)}</p>
          <p className="text-sm text-muted-foreground">Valid until: {formatDate(document.validUntil)}</p>
        </div>
      </header>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Prepared for</p>
          <p className="font-semibold">{document.clientName}</p>
          {document.clientAddress && <p className="text-sm text-muted-foreground">{document.clientAddress}</p>}
          {document.clientContact && <p className="text-sm text-muted-foreground">{document.clientContact}</p>}
        </div>
        {document.title && (
          <div className="sm:text-right">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Project</p>
            <p className="font-medium">{document.title}</p>
          </div>
        )}
      </div>
      <div className="grid gap-4 sm:hidden">
        {(Object.keys(ITEM_TYPE_LABELS) as QuotationItem['type'][]).map((type) => {
          const items = document.items.map((item, index) => ({ item, total: totals.lineTotals[index] ?? 0, index })).filter((r) => r.item.type === type);
          if (!items.length) return null;
          return (
            <section key={type} aria-label={ITEM_TYPE_LABELS[type]}>
              <h3 className="rounded bg-subtle px-2 py-1.5 text-xs font-semibold uppercase tracking-wide">{ITEM_TYPE_LABELS[type]}</h3>
              <ul className="divide-y">
                {items.map(({ item, total, index }) => (
                  <li key={index} className="flex items-start justify-between gap-3 py-2.5 text-sm">
                    <div className="min-w-0">
                      <p>{item.description}</p>
                      <p className="text-xs tabular-nums text-muted-foreground">
                        {item.quantity} {item.unit} × {formatPHP(item.unitPrice)}
                      </p>
                    </div>
                    <p className="shrink-0 font-medium tabular-nums">{formatPHP(total)}</p>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
      <div className="hidden overflow-x-auto sm:block">
        <table className="w-full min-w-[30rem] text-sm">
          <thead>
            <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th scope="col" className="py-2 pr-3 font-medium">
                Description
              </th>
              <th scope="col" className="px-3 py-2 text-right font-medium">
                Qty
              </th>
              <th scope="col" className="px-3 py-2 font-medium">
                Unit
              </th>
              <th scope="col" className="px-3 py-2 text-right font-medium">
                Unit price
              </th>
              <th scope="col" className="py-2 pl-3 text-right font-medium">
                Amount
              </th>
            </tr>
          </thead>
          {(Object.keys(ITEM_TYPE_LABELS) as QuotationItem['type'][]).map((type) => {
            const items = document.items.map((item, index) => ({ item, total: totals.lineTotals[index] ?? 0, index })).filter((r) => r.item.type === type);
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
            <dt className="text-muted-foreground">Discount{document.discountType === 'percent' ? ` (${document.discountValue / 100}%)` : ''}</dt>
            <dd>− {formatPHP(totals.discountAmount)}</dd>
          </div>
        )}
        {document.taxRateBps > 0 && (
          <div className="flex justify-between">
            <dt className="text-muted-foreground">VAT / Tax ({document.taxRateBps / 100}%)</dt>
            <dd>{formatPHP(totals.taxAmount)}</dd>
          </div>
        )}
        <div className="mt-1 flex justify-between border-t border-foreground pt-2 text-base font-semibold">
          <dt>Total</dt>
          <dd>{formatPHP(totals.total)}</dd>
        </div>
      </dl>
      {(document.paymentTerms || document.notes) && (
        <footer className="grid gap-4 border-t pt-6 text-sm">
          {document.paymentTerms && (
            <div>
              <p className="font-medium">Payment terms</p>
              <p className="whitespace-pre-line text-muted-foreground">{document.paymentTerms}</p>
            </div>
          )}
          {document.notes && (
            <div>
              <p className="font-medium">Notes</p>
              <p className="whitespace-pre-line text-muted-foreground">{document.notes}</p>
            </div>
          )}
        </footer>
      )}
    </article>
  );
}
