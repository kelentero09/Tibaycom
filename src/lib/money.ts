/**
 * All money is stored and computed as integer centavos to avoid floating point drift.
 * Quantities are held in thousandths (3 decimal places) while multiplying.
 */

const phpFormatter = new Intl.NumberFormat('en-PH', {
  style: 'currency',
  currency: 'PHP',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatPHP(centavos: number): string {
  return phpFormatter.format(centavos / 100);
}

/** "PHP 1,234.50" — for jsPDF's built-in fonts, which have no ₱ glyph. */
export function formatPHPAscii(centavos: number): string {
  const sign = centavos < 0 ? '-' : '';
  const abs = Math.abs(centavos);
  const whole = Math.floor(abs / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const cents = (abs % 100).toString().padStart(2, '0');
  return `${sign}PHP ${whole}.${cents}`;
}

/** Parses user input like "1,234.5" into centavos. Returns null when invalid or negative. */
export function parsePesos(input: string | number): number | null {
  const raw = typeof input === 'number' ? String(input) : input.replace(/[,\s₱]/g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(raw)) return null;
  const [whole = '0', frac = ''] = raw.split('.');
  const centavos = Number(whole) * 100 + Number(frac.padEnd(2, '0'));
  return Number.isSafeInteger(centavos) ? centavos : null;
}

export function centavosToInput(centavos: number): string {
  return (centavos / 100).toFixed(2);
}

/** Round half away from zero for non-negative integers division. */
export function divRound(numerator: number, denominator: number): number {
  return Math.floor((numerator + Math.floor(denominator / 2)) / denominator);
}

/** quantity (up to 3 decimals) × unit price (centavos) → centavos, rounded half up. */
export function lineTotal(quantity: number, unitPrice: number): number {
  const milli = Math.round(quantity * 1000);
  return divRound(milli * unitPrice, 1000);
}

/** amount × basis points (1% = 100 bps) → centavos, rounded half up. */
export function applyBps(amount: number, bps: number): number {
  return divRound(amount * bps, 10_000);
}
