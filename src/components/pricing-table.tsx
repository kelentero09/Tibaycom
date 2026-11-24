import Link from 'next/link';
import { Check, Minus } from 'lucide-react';
import type { Dictionary } from '@/lib/i18n';
import { formatPHP } from '@/lib/money';
import { formatQuota, type PlanConfig, type PlanLimits } from '@/lib/plans';
import { Button } from './ui/button';
import { Badge } from './ui/misc';

const rows: { label: string; value: (limits: PlanLimits) => string | boolean }[] = [
  { label: 'Public profile page', value: () => true },
  { label: 'Directory listing', value: () => true },
  { label: 'Profile QR code', value: () => true },
  { label: 'Requests inbox', value: () => true },
  { label: 'Shareable quotation links', value: () => true },
  { label: 'Portfolio projects', value: (l) => String(l.projects) },
  { label: 'Photos per project', value: (l) => String(l.photosPerProject) },
  { label: 'Project timeline updates', value: (l) => `${l.updatesPerProject} per project` },
  { label: 'Community posts', value: (l) => (l.postsPerDay === null ? 'Unlimited' : `${l.postsPerDay} / day`) },
  { label: 'Quotations (link or PDF)', value: (l) => (l.quotationsPerMonth === null ? 'Unlimited' : `${l.quotationsPerMonth} / month`) },
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

type Props = { config: PlanConfig; freeHref: string; premiumHref: string; labels: Dictionary['pricing']; compact?: boolean };

/** Rendered from the live plan configuration — prices and limits are never hardcoded in the UI. */
export function PricingTable({ config, freeHref, premiumHref, labels, compact }: Props) {
  const { monthly, annual } = config.pricing;
  const savings = monthly * 12 - annual;
  const highlights = (limits: PlanLimits) => [`${limits.projects} projects · ${limits.photosPerProject} photos each`, limits.quotationsPerMonth === null ? `${formatQuota(null)} quotations` : `${limits.quotationsPerMonth} quotations / month`, limits.postsPerDay === null ? 'Unlimited community posts' : `${limits.postsPerDay} community posts / day`];
  return (
    <div className="grid gap-8">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid content-start gap-4 rounded-2xl border bg-background p-6 shadow-card">
          <div>
            <h3 className="text-lg font-semibold">{labels.free}</h3>
            <p className="text-sm text-muted-foreground">{labels.freeBody}</p>
          </div>
          <p className="text-4xl font-semibold tracking-tight">
            ₱0 <span className="text-sm font-normal tracking-normal text-muted-foreground">{labels.forever}</span>
          </p>
          <ul className="grid gap-1.5 text-sm text-muted-foreground">
            {highlights(config.limits.free).map((line) => (
              <li key={line} className="flex items-center gap-2">
                <Check className="size-4 text-success" aria-hidden /> {line}
              </li>
            ))}
          </ul>
          <Button asChild variant="outline">
            <Link href={freeHref}>{labels.startFree}</Link>
          </Button>
        </div>
        <div className="relative grid content-start gap-4 rounded-2xl border-2 border-primary bg-background p-6 shadow-lift">
          <Badge variant="accent" className="absolute -top-3 left-6 border border-accent/20 shadow-card">
            {labels.popular}
          </Badge>
          <div className="flex items-start justify-between gap-2">
            <div>
              <h3 className="text-lg font-semibold">{labels.premium}</h3>
              <p className="text-sm text-muted-foreground">{labels.premiumBody}</p>
            </div>
            {savings > 0 && <Badge variant="success">−{formatPHP(savings).replace('.00', '')} / yr</Badge>}
          </div>
          <p className="text-4xl font-semibold tracking-tight">
            {formatPHP(monthly).replace('.00', '')} <span className="text-sm font-normal tracking-normal text-muted-foreground">{labels.perMonth}</span>
          </p>
          <ul className="grid gap-1.5 text-sm text-muted-foreground">
            {highlights(config.limits.premium).map((line) => (
              <li key={line} className="flex items-center gap-2">
                <Check className="size-4 text-success" aria-hidden /> {line}
              </li>
            ))}
          </ul>
          <p className="-mt-1 text-xs text-muted-foreground">
            {formatPHP(annual).replace('.00', '')} / year. {labels.payNote}
          </p>
          <Button asChild variant="accent">
            <Link href={premiumHref}>{labels.getPremium}</Link>
          </Button>
        </div>
      </div>
      {!compact && (
        <div className="overflow-x-auto rounded-xl border shadow-card">
          <table className="w-full min-w-[28rem] text-sm">
            <caption className="sr-only">Plan comparison</caption>
            <thead>
              <tr className="border-b bg-subtle text-left">
                <th scope="col" className="p-4 font-medium">
                  Feature
                </th>
                <th scope="col" className="w-28 p-4 text-center font-medium">
                  {labels.free}
                </th>
                <th scope="col" className="w-28 p-4 text-center font-medium">
                  {labels.premium}
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.label} className="border-b last:border-0 hover:bg-subtle/60">
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
