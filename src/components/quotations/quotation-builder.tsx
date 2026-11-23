'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { api, errorMessage } from '@/lib/api-client';
import { centavosToInput, formatPHP, parsePesos } from '@/lib/money';
import { calculateQuotation, ITEM_TYPE_LABELS, quotationInputSchema, type QuotationInput, type QuotationItem } from '@/lib/quotation';
import { Button } from '../ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Field, Input, Select, Textarea } from '../ui/form';
import { Alert } from '../ui/misc';

type Row = { key: number; type: QuotationItem['type']; description: string; quantity: string; unit: string; unitPrice: string };
type Props = { mode: 'create' | 'edit'; id?: string; initial?: QuotationInput; today: string };

let nextKey = 1;
const blankRow = (type: QuotationItem['type'] = 'material'): Row => ({ key: nextKey++, type, description: '', quantity: '1', unit: '', unitPrice: '' });
const addDays = (iso: string, days: number) => new Date(Date.parse(iso) + days * 86_400_000).toISOString().slice(0, 10);

export function QuotationBuilder({ mode, id, initial, today }: Props) {
  const router = useRouter();
  const [fields, setFields] = useState({
    title: initial?.title ?? '',
    clientName: initial?.clientName ?? '',
    clientAddress: initial?.clientAddress ?? '',
    clientContact: initial?.clientContact ?? '',
    issueDate: initial?.issueDate ?? today,
    validUntil: initial?.validUntil ?? addDays(today, 30),
    paymentTerms: initial?.paymentTerms ?? '50% down payment, 40% progress billing, 10% upon completion.',
    notes: initial?.notes ?? '',
  });
  const [rows, setRows] = useState<Row[]>(
    initial?.items.map((item) => ({ key: nextKey++, type: item.type, description: item.description, quantity: String(item.quantity), unit: item.unit, unitPrice: centavosToInput(item.unitPrice) })) ?? [blankRow()],
  );
  const [discountType, setDiscountType] = useState<QuotationInput['discountType']>(initial?.discountType ?? 'none');
  const [discountInput, setDiscountInput] = useState(initial ? (initial.discountType === 'percent' ? String(initial.discountValue / 100) : initial.discountType === 'fixed' ? centavosToInput(initial.discountValue) : '') : '');
  const [taxInput, setTaxInput] = useState(initial?.taxRateBps ? String(initial.taxRateBps / 100) : '');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const setField = (key: keyof typeof fields, value: string) => setFields((f) => ({ ...f, [key]: value }));
  const setRow = (key: number, patch: Partial<Row>) => setRows((list) => list.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  /** Converts form strings into the validated payload shape (money → centavos, percent → basis points). */
  const payload = useMemo(() => {
    const items = rows.map((r) => ({ type: r.type, description: r.description, quantity: Number(r.quantity), unit: r.unit, unitPrice: parsePesos(r.unitPrice || '0') ?? -1 }));
    const discountValue = discountType === 'percent' ? Math.round(Number(discountInput || 0) * 100) : discountType === 'fixed' ? (parsePesos(discountInput || '0') ?? -1) : 0;
    return { ...fields, items, discountType, discountValue, taxRateBps: Math.round(Number(taxInput || 0) * 100) };
  }, [fields, rows, discountType, discountInput, taxInput]);

  const totals = useMemo(
    () =>
      calculateQuotation({
        items: payload.items.map((i) => ({ ...i, quantity: Number.isFinite(i.quantity) && i.quantity > 0 ? i.quantity : 0, unitPrice: Math.max(0, i.unitPrice) })),
        discountType,
        discountValue: Math.max(0, Number.isFinite(payload.discountValue) ? payload.discountValue : 0),
        taxRateBps: Math.max(0, Number.isFinite(payload.taxRateBps) ? payload.taxRateBps : 0),
      }),
    [payload, discountType],
  );

  async function save(event: React.FormEvent) {
    event.preventDefault();
    const parsed = quotationInputSchema.safeParse(payload);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      const line = issue?.path[0] === 'items' && typeof issue.path[1] === 'number' ? `Line ${issue.path[1] + 1}: ` : '';
      return setError(`${line}${issue?.message ?? 'Please check the form.'}`);
    }
    setSaving(true);
    setError(null);
    try {
      const result = mode === 'create' ? await api<{ id: string }>('/api/quotations', { method: 'POST', body: parsed.data }) : (await api(`/api/quotations/${id}`, { method: 'PATCH', body: parsed.data }), { id: id! });
      toast.success(mode === 'create' ? 'Quotation created' : 'Quotation saved');
      router.push(`/quotations/${result.id}`);
      router.refresh();
    } catch (err) {
      setError(errorMessage(err));
      setSaving(false);
    }
  }

  return (
    <form onSubmit={save} className="grid gap-6 lg:grid-cols-[1fr_20rem] lg:items-start" noValidate>
      <div className="grid gap-6">
        {error && <Alert variant="destructive">{error}</Alert>}
        <Card>
          <CardHeader>
            <CardTitle>Client</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <Field label="Client name" htmlFor="q-client" required>
              <Input id="q-client" value={fields.clientName} maxLength={150} onChange={(e) => setField('clientName', e.target.value)} />
            </Field>
            <Field label="Contact (phone or email)" htmlFor="q-contact">
              <Input id="q-contact" value={fields.clientContact} maxLength={150} onChange={(e) => setField('clientContact', e.target.value)} />
            </Field>
            <Field label="Client address" htmlFor="q-address" className="sm:col-span-2">
              <Input id="q-address" value={fields.clientAddress} maxLength={300} onChange={(e) => setField('clientAddress', e.target.value)} />
            </Field>
            <Field label="Project / subject" htmlFor="q-title" className="sm:col-span-2">
              <Input id="q-title" value={fields.title} maxLength={150} placeholder="Kitchen renovation" onChange={(e) => setField('title', e.target.value)} />
            </Field>
            <Field label="Quotation date" htmlFor="q-date" required>
              <Input id="q-date" type="date" value={fields.issueDate} onChange={(e) => setField('issueDate', e.target.value)} />
            </Field>
            <Field label="Valid until" htmlFor="q-valid" required>
              <Input id="q-valid" type="date" value={fields.validUntil} min={fields.issueDate} onChange={(e) => setField('validUntil', e.target.value)} />
            </Field>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Line items</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3">
            <ol className="grid gap-3">
              {rows.map((row, index) => {
                const lineTotal = totals.lineTotals[index] ?? 0;
                return (
                  <li key={row.key} className="grid gap-3 rounded-md border p-3 sm:grid-cols-[8.5rem_1fr] lg:grid-cols-[8.5rem_1fr_5rem_5rem_8rem_auto] lg:items-end">
                    <Field label="Type" htmlFor={`i-type-${row.key}`}>
                      <Select id={`i-type-${row.key}`} value={row.type} onChange={(e) => setRow(row.key, { type: e.target.value as Row['type'] })}>
                        {Object.entries(ITEM_TYPE_LABELS).map(([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <Field label="Description" htmlFor={`i-desc-${row.key}`}>
                      <Input id={`i-desc-${row.key}`} value={row.description} maxLength={300} onChange={(e) => setRow(row.key, { description: e.target.value })} />
                    </Field>
                    <div className="grid grid-cols-3 gap-3 sm:col-span-2 lg:contents">
                      <Field label="Qty" htmlFor={`i-qty-${row.key}`}>
                        <Input id={`i-qty-${row.key}`} inputMode="decimal" value={row.quantity} onChange={(e) => setRow(row.key, { quantity: e.target.value.replace(/[^\d.]/g, '') })} />
                      </Field>
                      <Field label="Unit" htmlFor={`i-unit-${row.key}`}>
                        <Input id={`i-unit-${row.key}`} value={row.unit} maxLength={20} placeholder="pcs" onChange={(e) => setRow(row.key, { unit: e.target.value })} />
                      </Field>
                      <Field label="Unit price (₱)" htmlFor={`i-price-${row.key}`}>
                        <Input id={`i-price-${row.key}`} inputMode="decimal" value={row.unitPrice} placeholder="0.00" onChange={(e) => setRow(row.key, { unitPrice: e.target.value.replace(/[^\d.,]/g, '') })} />
                      </Field>
                    </div>
                    <div className="flex items-center justify-between gap-2 sm:col-span-2 lg:col-span-1 lg:h-11">
                      <span className="text-sm font-medium tabular-nums lg:hidden">{formatPHP(lineTotal)}</span>
                      <Button variant="ghost" size="icon" className="text-destructive" disabled={rows.length === 1} aria-label={`Remove line ${index + 1}`} onClick={() => setRows((list) => list.filter((r) => r.key !== row.key))}>
                        <Trash2 />
                      </Button>
                    </div>
                    <p className="hidden text-right text-sm tabular-nums text-muted-foreground lg:col-span-6 lg:block">Line total: {formatPHP(lineTotal)}</p>
                  </li>
                );
              })}
            </ol>
            <div className="flex flex-wrap gap-2">
              {(Object.keys(ITEM_TYPE_LABELS) as QuotationItem['type'][]).map((type) => (
                <Button key={type} variant="outline" size="sm" disabled={rows.length >= 100} onClick={() => setRows((list) => [...list, blankRow(type)])}>
                  <Plus aria-hidden /> {ITEM_TYPE_LABELS[type]}
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Terms</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            <Field label="Payment terms" htmlFor="q-terms">
              <Textarea id="q-terms" rows={3} value={fields.paymentTerms} maxLength={1000} onChange={(e) => setField('paymentTerms', e.target.value)} />
            </Field>
            <Field label="Notes" htmlFor="q-notes" hint="Inclusions, exclusions, warranty, schedule…">
              <Textarea id="q-notes" rows={3} value={fields.notes} maxLength={2000} aria-describedby="q-notes-help" onChange={(e) => setField('notes', e.target.value)} />
            </Field>
          </CardContent>
        </Card>
      </div>

      <Card className="lg:sticky lg:top-20">
        <CardHeader>
          <CardTitle>Summary</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Discount" htmlFor="q-disc-type">
              <Select id="q-disc-type" value={discountType} onChange={(e) => (setDiscountType(e.target.value as QuotationInput['discountType']), setDiscountInput(''))}>
                <option value="none">None</option>
                <option value="percent">Percent (%)</option>
                <option value="fixed">Amount (₱)</option>
              </Select>
            </Field>
            <Field label={discountType === 'percent' ? 'Percent' : 'Amount'} htmlFor="q-disc">
              <Input id="q-disc" inputMode="decimal" disabled={discountType === 'none'} value={discountInput} onChange={(e) => setDiscountInput(e.target.value.replace(/[^\d.,]/g, ''))} />
            </Field>
          </div>
          <Field label="VAT / tax rate (%)" htmlFor="q-tax" hint="Leave blank if not applicable. Standard VAT is 12%.">
            <div className="flex gap-2">
              <Input id="q-tax" inputMode="decimal" value={taxInput} aria-describedby="q-tax-help" onChange={(e) => setTaxInput(e.target.value.replace(/[^\d.]/g, ''))} />
              <Button variant="outline" onClick={() => setTaxInput(taxInput === '12' ? '' : '12')}>
                {taxInput === '12' ? 'Remove' : '12% VAT'}
              </Button>
            </div>
          </Field>
          <dl className="grid gap-2 border-t pt-4 text-sm tabular-nums" aria-live="polite">
            {(Object.keys(ITEM_TYPE_LABELS) as QuotationItem['type'][]).filter((t) => totals.byType[t] > 0).map((type) => (
              <div key={type} className="flex justify-between text-muted-foreground">
                <dt>{ITEM_TYPE_LABELS[type]}</dt>
                <dd>{formatPHP(totals.byType[type])}</dd>
              </div>
            ))}
            <div className="flex justify-between">
              <dt>Subtotal</dt>
              <dd>{formatPHP(totals.subtotal)}</dd>
            </div>
            {totals.discountAmount > 0 && (
              <div className="flex justify-between">
                <dt>Discount</dt>
                <dd>− {formatPHP(totals.discountAmount)}</dd>
              </div>
            )}
            {totals.taxAmount > 0 && (
              <div className="flex justify-between">
                <dt>Tax</dt>
                <dd>{formatPHP(totals.taxAmount)}</dd>
              </div>
            )}
            <div className="flex justify-between border-t pt-3 text-base font-semibold">
              <dt>Total</dt>
              <dd data-testid="grand-total">{formatPHP(totals.total)}</dd>
            </div>
          </dl>
          <Button type="submit" size="lg" loading={saving}>
            {mode === 'create' ? 'Save quotation' : 'Save changes'}
          </Button>
          <Button variant="ghost" onClick={() => router.back()}>
            Cancel
          </Button>
        </CardContent>
      </Card>
    </form>
  );
}
