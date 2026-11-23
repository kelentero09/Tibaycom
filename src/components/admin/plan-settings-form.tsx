'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { api, errorMessage } from '@/lib/api-client';
import { centavosToInput, parsePesos } from '@/lib/money';
import { planConfigSchema, type PlanConfig, type PlanLimits } from '@/lib/plans';
import { Button } from '../ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { ConfirmDialog } from '../ui/dialog';
import { Field, Input } from '../ui/form';
import { Alert } from '../ui/misc';

const numericLimits: { key: 'projects' | 'photosPerProject'; label: string }[] = [
  { key: 'projects', label: 'Projects' },
  { key: 'photosPerProject', label: 'Photos per project' },
];
const featureFlags: { key: 'customQuotationBranding' | 'quotationHistory' | 'customCoverPhoto' | 'removePlatformBranding'; label: string }[] = [
  { key: 'customQuotationBranding', label: 'Custom quotation branding' },
  { key: 'quotationHistory', label: 'Quotation history' },
  { key: 'customCoverPhoto', label: 'Custom cover photo' },
  { key: 'removePlatformBranding', label: 'Remove platform branding' },
];

export function PlanSettingsForm({ initial }: { initial: PlanConfig }) {
  const router = useRouter();
  const [monthly, setMonthly] = useState(centavosToInput(initial.pricing.monthly));
  const [annual, setAnnual] = useState(centavosToInput(initial.pricing.annual));
  const [reminderDays, setReminderDays] = useState(String(initial.renewalReminderDays));
  const [limits, setLimits] = useState(initial.limits);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<PlanConfig | null>(null);
  const [saving, setSaving] = useState(false);

  const setLimit = <K extends keyof PlanLimits>(plan: 'free' | 'premium', key: K, value: PlanLimits[K]) => setLimits((l) => ({ ...l, [plan]: { ...l[plan], [key]: value } }));

  function review(event: React.FormEvent) {
    event.preventDefault();
    const parsed = planConfigSchema.safeParse({ pricing: { monthly: parsePesos(monthly) ?? -1, annual: parsePesos(annual) ?? -1 }, limits, renewalReminderDays: Number(reminderDays) });
    if (!parsed.success) return setError(`${parsed.error.issues[0]?.path.join(' › ')}: ${parsed.error.issues[0]?.message}`);
    setError(null);
    setConfirm(parsed.data);
  }

  async function save() {
    if (!confirm) return;
    setSaving(true);
    try {
      await api('/api/admin/actions/settings.plans', { method: 'POST', body: confirm });
      toast.success('Plan settings saved');
      setConfirm(null);
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={review} className="grid gap-6" noValidate>
      {error && <Alert variant="destructive">{error}</Alert>}
      <Card>
        <CardHeader>
          <CardTitle>Premium pricing</CardTitle>
          <CardDescription>Applies to new checkouts only. Existing paid periods are not affected. PayMongo’s minimum charge is ₱20.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          <Field label="Monthly price (₱)" htmlFor="ps-monthly">
            <Input id="ps-monthly" inputMode="decimal" value={monthly} onChange={(e) => setMonthly(e.target.value)} />
          </Field>
          <Field label="Annual price (₱)" htmlFor="ps-annual">
            <Input id="ps-annual" inputMode="decimal" value={annual} onChange={(e) => setAnnual(e.target.value)} />
          </Field>
          <Field label="Renewal reminder (days before end)" htmlFor="ps-reminder">
            <Input id="ps-reminder" type="number" min={1} max={30} value={reminderDays} onChange={(e) => setReminderDays(e.target.value)} />
          </Field>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        {(['free', 'premium'] as const).map((plan) => (
          <Card key={plan}>
            <CardHeader>
              <CardTitle>{plan === 'free' ? 'Free plan limits' : 'Premium plan limits'}</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4">
              <div className="grid gap-4 sm:grid-cols-3">
                {numericLimits.map(({ key, label }) => (
                  <Field key={key} label={label} htmlFor={`ps-${plan}-${key}`}>
                    <Input id={`ps-${plan}-${key}`} type="number" min={0} value={limits[plan][key]} onChange={(e) => setLimit(plan, key, Math.max(0, Math.trunc(Number(e.target.value) || 0)))} />
                  </Field>
                ))}
                <Field label="Quotations / month" htmlFor={`ps-${plan}-quotes`}>
                  <Input id={`ps-${plan}-quotes`} type="number" min={0} disabled={limits[plan].quotationsPerMonth === null} value={limits[plan].quotationsPerMonth ?? ''} placeholder="Unlimited" onChange={(e) => setLimit(plan, 'quotationsPerMonth', Math.max(0, Math.trunc(Number(e.target.value) || 0)))} />
                </Field>
              </div>
              <div className="grid gap-2">
                <label className="flex items-center gap-2.5 text-sm">
                  <input type="checkbox" className="size-4 accent-[var(--color-primary)]" checked={limits[plan].quotationsPerMonth === null} onChange={(e) => setLimit(plan, 'quotationsPerMonth', e.target.checked ? null : 50)} />
                  Unlimited quotations
                </label>
                {featureFlags.map(({ key, label }) => (
                  <label key={key} className="flex items-center gap-2.5 text-sm">
                    <input type="checkbox" className="size-4 accent-[var(--color-primary)]" checked={limits[plan][key]} onChange={(e) => setLimit(plan, key, e.target.checked)} />
                    {label}
                  </label>
                ))}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
      <Button type="submit" className="justify-self-start">
        Review & save
      </Button>
      <ConfirmDialog open={!!confirm} onOpenChange={(open) => !open && setConfirm(null)} destructive={false} title="Save plan settings?" description="New prices and limits take effect immediately for every user and are recorded in the audit log. Lowering a limit hides content above it; it never deletes anything." confirmLabel="Save settings" loading={saving} onConfirm={save} />
    </form>
  );
}
