import { describe, expect, it } from 'vitest';
import { applyBps, formatPHP, formatPHPAscii, lineTotal, parsePesos } from '@/lib/money';
import { calculateQuotation, quotationInputSchema } from '@/lib/quotation';

describe('money', () => {
  it('formats centavos as Philippine pesos', () => {
    expect(formatPHP(14_900)).toBe('₱149.00');
    expect(formatPHP(123_456_789)).toBe('₱1,234,567.89');
    expect(formatPHPAscii(123_456_789)).toBe('PHP 1,234,567.89');
    expect(formatPHPAscii(5)).toBe('PHP 0.05');
  });

  it('parses peso input without floating point error', () => {
    expect(parsePesos('1,234.5')).toBe(123_450);
    expect(parsePesos('0.1')).toBe(10);
    expect(parsePesos('19.99')).toBe(1_999);
    expect(parsePesos('₱ 2,500')).toBe(250_000);
  });

  it('rejects invalid, negative or over-precise amounts', () => {
    for (const bad of ['', 'abc', '-5', '1.234', '1e5', '1..2', '.5']) expect(parsePesos(bad)).toBeNull();
  });

  it('multiplies quantity by price exactly (classic float traps)', () => {
    expect(lineTotal(3, 10)).toBe(30); // 0.1 × 3
    expect(lineTotal(1.1, 110)).toBe(121); // 1.1 × 1.10
    expect(lineTotal(0.333, 100_000)).toBe(33_300);
    expect(lineTotal(2.5, 33_333)).toBe(83_333); // 83,332.5 rounds half up
  });

  it('applies basis points with half-up rounding', () => {
    expect(applyBps(10_000, 1_200)).toBe(1_200);
    expect(applyBps(999, 1_200)).toBe(120); // 119.88
    expect(applyBps(1, 5_000)).toBe(1); // 0.5 centavo rounds up
  });
});

const items = [
  { type: 'material' as const, description: 'Cement', quantity: 40, unit: 'bags', unitPrice: 26_000 },
  { type: 'labor' as const, description: 'Masonry', quantity: 12.5, unit: 'days', unitPrice: 85_050 },
  { type: 'service' as const, description: 'Hauling', quantity: 1, unit: 'lot', unitPrice: 350_000 },
];

describe('quotation calculation', () => {
  it('computes subtotal, grouped totals and grand total', () => {
    const totals = calculateQuotation({ items, discountType: 'none', discountValue: 0, taxRateBps: 0 });
    expect(totals.lineTotals).toEqual([1_040_000, 1_063_125, 350_000]);
    expect(totals.byType).toEqual({ material: 1_040_000, labor: 1_063_125, service: 350_000 });
    expect(totals.subtotal).toBe(2_453_125);
    expect(totals.total).toBe(2_453_125);
  });

  it('applies a percentage discount before 12% VAT', () => {
    const totals = calculateQuotation({ items, discountType: 'percent', discountValue: 1_000, taxRateBps: 1_200 });
    expect(totals.discountAmount).toBe(245_313); // 245,312.5 rounds half up
    expect(totals.taxableAmount).toBe(2_207_812);
    expect(totals.taxAmount).toBe(264_937); // 264,937.44
    expect(totals.total).toBe(2_472_749);
  });

  it('caps a fixed discount at the subtotal so totals never go negative', () => {
    const totals = calculateQuotation({ items: [items[2]!], discountType: 'fixed', discountValue: 9_999_999, taxRateBps: 1_200 });
    expect(totals.discountAmount).toBe(350_000);
    expect(totals.taxAmount).toBe(0);
    expect(totals.total).toBe(0);
  });

  it('keeps total = taxable + tax for many line items (no drift)', () => {
    const many = Array.from({ length: 100 }, (_, i) => ({ type: 'material' as const, quantity: 0.1 + i / 1000, unitPrice: 333 + i }));
    const totals = calculateQuotation({ items: many, discountType: 'percent', discountValue: 333, taxRateBps: 1_200 });
    expect(Number.isInteger(totals.total)).toBe(true);
    expect(totals.subtotal).toBe(totals.lineTotals.reduce((a, b) => a + b, 0));
    expect(totals.total).toBe(totals.subtotal - totals.discountAmount + totals.taxAmount);
  });
});

describe('quotation validation', () => {
  const base = { clientName: 'Maria Santos', issueDate: '2026-11-01', validUntil: '2026-12-01', items };

  it('accepts a valid quotation and applies defaults', () => {
    const parsed = quotationInputSchema.parse(base);
    expect(parsed.discountType).toBe('none');
    expect(parsed.taxRateBps).toBe(0);
  });

  it.each([
    ['no line items', { ...base, items: [] }],
    ['zero quantity', { ...base, items: [{ ...items[0]!, quantity: 0 }] }],
    ['negative price', { ...base, items: [{ ...items[0]!, unitPrice: -1 }] }],
    ['fractional centavos', { ...base, items: [{ ...items[0]!, unitPrice: 10.5 }] }],
    ['too many decimals in quantity', { ...base, items: [{ ...items[0]!, quantity: 1.2345 }] }],
    ['discount above 100%', { ...base, discountType: 'percent', discountValue: 10_001 }],
    ['tax above 100%', { ...base, taxRateBps: 10_001 }],
    ['validity before issue date', { ...base, validUntil: '2026-10-31' }],
    ['missing client', { ...base, clientName: '  ' }],
    ['absurd amounts', { ...base, items: [{ ...items[0]!, unitPrice: Number.MAX_SAFE_INTEGER }] }],
    ['more than 100 lines', { ...base, items: Array.from({ length: 101 }, () => items[0]!) }],
  ])('rejects %s', (_label, input) => {
    expect(quotationInputSchema.safeParse(input).success).toBe(false);
  });
});
