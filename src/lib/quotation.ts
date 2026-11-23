import { z } from 'zod';
import { applyBps, lineTotal } from './money';

const MAX_MONEY = 100_000_000_000; // ₱1B in centavos — keeps every product inside safe integers

export const quotationItemSchema = z.object({
  type: z.enum(['material', 'labor', 'service']),
  description: z.string().trim().min(1, 'Description is required').max(300),
  quantity: z
    .number()
    .positive('Quantity must be greater than 0')
    .max(1_000_000)
    .refine((q) => Math.abs(q * 1000 - Math.round(q * 1000)) < 1e-6, 'Up to 3 decimal places'),
  unit: z.string().trim().max(20).default(''),
  unitPrice: z.number().int('Invalid price').min(0).max(MAX_MONEY),
});

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date');

export const quotationInputSchema = z
  .object({
    title: z.string().trim().max(150).default(''),
    clientName: z.string().trim().min(1, 'Client name is required').max(150),
    clientAddress: z.string().trim().max(300).default(''),
    clientContact: z.string().trim().max(150).default(''),
    issueDate: isoDate,
    validUntil: isoDate,
    items: z.array(quotationItemSchema).min(1, 'Add at least one line item').max(100),
    discountType: z.enum(['none', 'percent', 'fixed']).default('none'),
    discountValue: z.number().int().min(0).max(MAX_MONEY).default(0),
    taxRateBps: z.number().int().min(0).max(10_000).default(0),
    paymentTerms: z.string().trim().max(1000).default(''),
    notes: z.string().trim().max(2000).default(''),
  })
  .refine((q) => q.validUntil >= q.issueDate, { path: ['validUntil'], message: 'Validity must be on or after the quotation date' })
  .refine((q) => q.discountType !== 'percent' || q.discountValue <= 10_000, {
    path: ['discountValue'],
    message: 'Discount cannot exceed 100%',
  });

export type QuotationItem = z.infer<typeof quotationItemSchema>;
export type QuotationInput = z.infer<typeof quotationInputSchema>;

export type QuotationTotals = {
  lineTotals: number[];
  byType: Record<QuotationItem['type'], number>;
  subtotal: number;
  discountAmount: number;
  taxableAmount: number;
  taxAmount: number;
  total: number;
};

type CalcInput = Pick<QuotationInput, 'discountType' | 'discountValue' | 'taxRateBps'> & {
  items: Pick<QuotationItem, 'type' | 'quantity' | 'unitPrice'>[];
};

/**
 * Single source of truth for quotation math — used by the live builder, the PDF and the server.
 * Order: subtotal → discount (capped at subtotal) → tax on the discounted amount → total.
 */
export function calculateQuotation(input: CalcInput): QuotationTotals {
  const byType = { material: 0, labor: 0, service: 0 };
  const lineTotals = input.items.map((item) => {
    const total = lineTotal(item.quantity, item.unitPrice);
    byType[item.type] += total;
    return total;
  });
  const subtotal = lineTotals.reduce((sum, n) => sum + n, 0);
  let discountAmount = 0;
  if (input.discountType === 'percent') discountAmount = applyBps(subtotal, Math.min(input.discountValue, 10_000));
  else if (input.discountType === 'fixed') discountAmount = Math.min(input.discountValue, subtotal);
  const taxableAmount = subtotal - discountAmount;
  const taxAmount = applyBps(taxableAmount, input.taxRateBps);
  return { lineTotals, byType, subtotal, discountAmount, taxableAmount, taxAmount, total: taxableAmount + taxAmount };
}

export const ITEM_TYPE_LABELS: Record<QuotationItem['type'], string> = {
  material: 'Materials',
  labor: 'Labor',
  service: 'Services',
};
