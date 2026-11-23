'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Check, Sparkles } from 'lucide-react';
import { formatPHP } from '@/lib/money';
import type { PlanLimits } from '@/lib/plans';

const quotes = (premium: PlanLimits) => (premium.quotationsPerMonth === null ? 'unlimited quotations' : `${premium.quotationsPerMonth} quotations a month`);
import { cn } from '@/lib/utils';
import { Button } from './ui/button';
import { Dialog, DialogContent } from './ui/dialog';

/** The moment a user runs into a plan limit. Each has its own message so the prompt explains exactly what they gain. */
export type UpgradeReason = 'projects' | 'photos' | 'quotations' | 'cover' | 'history' | 'branding' | 'generic';
export const UPGRADE_EVENT = 'tibay:upgrade';

/** Opens the upgrade dialog from anywhere (also fired automatically by the API client on a plan-limit response). */
export function promptUpgrade(reason: UpgradeReason) {
  window.dispatchEvent(new CustomEvent<UpgradeReason>(UPGRADE_EVENT, { detail: reason }));
}

type Copy = { title: string; body: string };
const copy = (premium: PlanLimits): Record<UpgradeReason, Copy> => ({
  projects: { title: 'You’ve filled every project slot', body: `Premium shows up to ${premium.projects} projects with ${premium.photosPerProject} photos each, so clients see the full range of your work.` },
  photos: { title: 'This project is full', body: `Premium lets you add ${premium.photosPerProject} photos to every project — enough to show the work from start to finish.` },
  quotations: { title: 'You’ve used this month’s quotations', body: `Keep quoting without waiting for next month: Premium gives you ${quotes(premium)}.` },
  cover: { title: 'Make your profile yours', body: 'A custom cover photo is the first thing clients see. It’s included with Premium.' },
  history: { title: 'Your past quotations are saved', body: 'Premium unlocks your full quotation history — open, edit and reuse any quotation you’ve made.' },
  branding: { title: 'Put your logo on every quotation', body: 'Premium adds your logo to quotations and removes the “Made with Tibay” footer.' },
  generic: { title: 'Do more with Premium', body: 'More projects, more photos per project, more quotations and your own branding.' },
});

function benefits(premium: PlanLimits) {
  return [`${premium.projects} projects, ${premium.photosPerProject} photos each`, `${quotes(premium).replace(/^u/, 'U')}, with your logo`, 'Quotation history and a custom cover photo', 'No “Made with Tibay” on your profile'];
}

type HostProps = { monthly: number; annual: number; premium: PlanLimits };

/** Mounted once in the site layout. */
export function UpgradeDialogHost({ monthly, annual, premium }: HostProps) {
  const [reason, setReason] = useState<UpgradeReason | null>(null);
  useEffect(() => {
    const onUpgrade = (event: Event) => setReason((event as CustomEvent<UpgradeReason>).detail ?? 'generic');
    window.addEventListener(UPGRADE_EVENT, onUpgrade);
    return () => window.removeEventListener(UPGRADE_EVENT, onUpgrade);
  }, []);
  const text = copy(premium)[reason ?? 'generic'];

  return (
    <Dialog open={reason !== null} onOpenChange={(open) => !open && setReason(null)}>
      <DialogContent title={text.title} description={text.body} className="sm:max-w-md">
        <div className="grid gap-5">
          <ul className="grid gap-2.5 rounded-lg bg-subtle p-4 text-sm">
            {benefits(premium).map((benefit) => (
              <li key={benefit} className="flex items-start gap-2.5">
                <Check className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
                {benefit}
              </li>
            ))}
          </ul>
          <p className="text-sm text-muted-foreground">
            <span className="text-2xl font-semibold text-foreground">{formatPHP(monthly).replace('.00', '')}</span> / month, or {formatPHP(annual).replace('.00', '')} a year. GCash, Maya or card — never charged automatically.
          </p>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="ghost" onClick={() => setReason(null)}>
              Not now
            </Button>
            <Button asChild variant="accent" size="lg">
              <Link href="/account/subscription" onClick={() => setReason(null)}>
                <Sparkles aria-hidden /> Upgrade to Premium
              </Link>
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

type BannerProps = { title: string; body: string; cta?: string; tone?: 'accent' | 'neutral'; className?: string };

/** Inline nudge shown before the limit is reached (e.g. "1 quotation left this month"). */
export function UpgradeBanner({ title, body, cta = 'See Premium', tone = 'accent', className }: BannerProps) {
  return (
    <div className={cn('flex animate-fade-in flex-col gap-3 rounded-xl border p-4 sm:flex-row sm:items-center sm:justify-between', tone === 'accent' ? 'border-accent/25 bg-accent-soft' : 'border-dashed bg-subtle', className)}>
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-background text-accent shadow-card">
          <Sparkles className="size-4" aria-hidden />
        </span>
        <p className="text-sm leading-relaxed">
          <span className="font-medium">{title}</span> <span className="text-muted-foreground">{body}</span>
        </p>
      </div>
      <Button asChild variant={tone === 'accent' ? 'accent' : 'outline'} size="sm" className="shrink-0">
        <Link href="/account/subscription">{cta}</Link>
      </Button>
    </div>
  );
}

/** Button that opens the upgrade dialog for a specific reason (used where a feature is locked). */
export function UpgradeButton({ reason, children, className }: { reason: UpgradeReason; children: React.ReactNode; className?: string }) {
  return (
    <Button variant="outline" size="sm" className={className} onClick={() => promptUpgrade(reason)}>
      {children}
    </Button>
  );
}
