import Link from 'next/link';
import { Check, Minus } from 'lucide-react';
import { formatPHP } from '@/lib/money';
import type { PlanConfig, PlanLimits } from '@/lib/plans';
import { Button } from './ui/button';
import { Badge } from './ui/misc';

const rows: { label: string; value: (limits: PlanLimits) => string | boolean }[] = [
  { label: 'Public profile page', value: () => true },
  { label: 'Directory listing', value: () => true },
  { label: 'Profile QR code', value: () => true },
  { label: 'Portfolio projects', value: (l) => String(l.projects) },
  { label: 'Total photos', value: (l) => String(l.photos) },
  { label: 'PDF quotations', value: (l) => `${l.quotationsPerMonth} / month` },
  { label: 'Your logo & branding on quotations', value: (l) => l.customQuotationBranding },
  { label: 'Quotation history', value: (l) => l.quotationHistory },
  { label: 'Custom cover photo', value: (l) => l.customCoverPhoto },
  { label: 'Remove “Made with Tibay”', value: (l) => l.removePlatformBranding },
];

function Cell({ value }: { value: string | boolean }) {
  if (value === true) return <Check className="mx-auto size-5 text-success" aria-label="Included" />;
  if (value === false) return <Minus className="mx-auto size-5 text-muted-foreground" aria-label="Not included" />;
  return <span className="font-medium">{value}</span>;
}

/** Rendered from the live plan configuration — prices and limits are never hardcoded in the UI. */
export function PricingTable({ config, freeHref, premiumHref, compact }: { config: PlanConfig; freeHref: string; premiumHref: string; compact?: boolean }) {
  const { monthly, annual } = config.pricing;
  const savings = monthly * 12 - annual;
  return (
    <div className="grid gap-8">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid content-start gap-4 rounded-xl border p-6">
          <div>
            <h3 className="text-lg font-semibold">Free</h3>
            <p className="text-sm text-muted-foreground">Everything you need to be found online.</p>
          </div>
          <p className="text-3xl font-semibold">
            ₱0 <span className="text-sm font-normal text-muted-foreground">forever</span>
          </p>
          <Button asChild variant="outline">
            <Link href={freeHref}>Start free</Link>
          </Button>
        </div>
        <div className="grid content-start gap-4 rounded-xl border-2 border-primary p-6">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h3 className="text-lg font-semibold">Premium</h3>
              <p className="text-sm text-muted-foreground">More projects, branded quotations, your own look.</p>
            </div>
            {savings > 0 && <Badge variant="accent">Save {formatPHP(savings)} yearly</Badge>}
          </div>
          <p className="text-3xl font-semibold">
            {formatPHP(monthly).replace('.00', '')} <span className="text-sm font-normal text-muted-foreground">/ month</span>
          </p>
          <p className="-mt-2 text-sm text-muted-foreground">or {formatPHP(annual).replace('.00', '')} / year. Pay with GCash, Maya or card. No auto-charge.</p>
          <Button asChild variant="accent">
            <Link href={premiumHref}>Get Premium</Link>
          </Button>
        </div>
      </div>
      {!compact && (
        <div className="overflow-x-auto rounded-xl border">
          <table className="w-full min-w-[28rem] text-sm">
            <caption className="sr-only">Plan comparison</caption>
            <thead>
              <tr className="border-b bg-subtle text-left">
                <th scope="col" className="p-4 font-medium">
                  Feature
                </th>
                <th scope="col" className="w-28 p-4 text-center font-medium">
                  Free
                </th>
                <th scope="col" className="w-28 p-4 text-center font-medium">
                  Premium
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.label} className="border-b last:border-0">
                  <th scope="row" className="p-4 text-left font-normal">
                    {row.label}
                  </th>
                  <td className="p-4 text-center">
                    <Cell value={row.value(config.limits.free)} />
                  </td>
                  <td className="p-4 text-center">
                    <Cell value={row.value(config.limits.premium)} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
