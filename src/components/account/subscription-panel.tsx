'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { api, errorMessage } from '@/lib/api-client';
import { formatPHP } from '@/lib/money';
import type { BillingInterval } from '@/lib/plans';
import { Button } from '../ui/button';
import { ConfirmDialog } from '../ui/dialog';
import { Alert } from '../ui/misc';

type Props = {
  pricing: Record<BillingInterval, number>;
  isPremium: boolean;
  cancelAtPeriodEnd: boolean;
  /** Payment id from the PayMongo return URL, if the user just came back from checkout. */
  returningPaymentId: string | null;
  cancelledCheckout: boolean;
};

/**
 * Purchase / renew / cancel controls. Premium is only ever granted by the server after it verifies
 * the payment with PayMongo — returning to this page with a "success" URL does nothing by itself.
 */
export function SubscriptionPanel({ pricing, isPremium, cancelAtPeriodEnd, returningPaymentId, cancelledCheckout }: Props) {
  const router = useRouter();
  const [interval, setIntervalChoice] = useState<BillingInterval>('annual');
  const [starting, setStarting] = useState(false);
  const [verifying, setVerifying] = useState(!!returningPaymentId && !cancelledCheckout);
  const [verifyResult, setVerifyResult] = useState<'paid' | 'pending' | 'failed' | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [updating, setUpdating] = useState(false);
  const polled = useRef(false);

  useEffect(() => {
    if (!returningPaymentId || cancelledCheckout || polled.current) return;
    polled.current = true;
    let stopped = false;
    (async () => {
      // The webhook usually lands first; poll the server-side verification briefly in case it has not.
      for (let attempt = 0; attempt < 8 && !stopped; attempt++) {
        try {
          const { status } = await api<{ status: string }>('/api/billing/verify', { method: 'POST', body: { paymentId: returningPaymentId } });
          if (status === 'paid') {
            setVerifyResult('paid');
            setVerifying(false);
            router.replace('/account/subscription');
            router.refresh();
            return;
          }
          if (status === 'failed' && attempt >= 2) break;
        } catch {
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 2500));
      }
      if (!stopped) {
        setVerifyResult('pending');
        setVerifying(false);
      }
    })();
    return () => {
      stopped = true;
    };
  }, [returningPaymentId, cancelledCheckout, router]);

  async function checkout() {
    setStarting(true);
    try {
      const { checkoutUrl } = await api<{ checkoutUrl: string }>('/api/billing/checkout', { method: 'POST', body: { interval } });
      window.location.assign(checkoutUrl);
    } catch (err) {
      toast.error(errorMessage(err));
      setStarting(false);
    }
  }

  async function setCancel(cancel: boolean) {
    setUpdating(true);
    try {
      await api('/api/billing/cancel', { method: 'POST', body: { cancel } });
      toast.success(cancel ? 'Renewal reminders turned off' : 'Renewal reminders turned back on');
      setConfirmCancel(false);
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setUpdating(false);
    }
  }

  const savings = pricing.monthly * 12 - pricing.annual;
  const options: { value: BillingInterval; label: string; price: number; note: string }[] = [
    { value: 'annual', label: '1 year', price: pricing.annual, note: savings > 0 ? `Save ${formatPHP(savings)}` : 'Best value' },
    { value: 'monthly', label: '1 month', price: pricing.monthly, note: 'Pay as you go' },
  ];

  return (
    <div className="grid gap-5">
      {verifying && (
        <Alert>
          <Loader2 className="mr-2 inline size-4 animate-spin" aria-hidden /> Confirming your payment with PayMongo…
        </Alert>
      )}
      {verifyResult === 'paid' && <Alert variant="success">Payment confirmed. Premium is now active — thank you!</Alert>}
      {verifyResult === 'pending' && <Alert variant="warning">We have not received confirmation of your payment yet. If you completed it, Premium will activate automatically within a few minutes — you can safely leave this page.</Alert>}
      {cancelledCheckout && <Alert>Checkout was cancelled. You have not been charged.</Alert>}

      <fieldset className="grid gap-3">
        <legend className="mb-1 text-sm font-medium">{isPremium ? 'Add more time' : 'Choose a period'}</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          {options.map((option) => (
            <label key={option.value} className={`flex cursor-pointer items-center justify-between gap-3 rounded-lg border p-4 has-[:focus-visible]:outline-2 ${interval === option.value ? 'border-primary ring-1 ring-primary' : ''}`}>
              <span className="flex items-center gap-3">
                <input type="radio" name="interval" className="size-4 accent-[var(--color-primary)]" checked={interval === option.value} onChange={() => setIntervalChoice(option.value)} />
                <span>
                  <span className="block font-medium">{option.label}</span>
                  <span className="block text-xs text-muted-foreground">{option.note}</span>
                </span>
              </span>
              <span className="font-semibold tabular-nums">{formatPHP(option.price)}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <Button variant="accent" size="lg" loading={starting} onClick={() => void checkout()}>
        {isPremium ? 'Renew / extend Premium' : 'Upgrade to Premium'}
      </Button>
      <p className="text-xs text-muted-foreground">Secure payment by PayMongo — GCash, Maya, cards and QR Ph. One-time prepaid payment; you are never charged automatically.</p>

      {isPremium && (
        <div className="flex flex-col gap-2 border-t pt-5 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground">{cancelAtPeriodEnd ? 'Renewal reminders are off. Premium stays active until the end date above.' : 'Not planning to renew? Turn off renewal reminders.'}</p>
          {cancelAtPeriodEnd ? (
            <Button variant="outline" size="sm" loading={updating} onClick={() => void setCancel(false)}>
              Turn reminders back on
            </Button>
          ) : (
            <Button variant="ghost" size="sm" className="text-destructive" onClick={() => setConfirmCancel(true)}>
              Cancel subscription
            </Button>
          )}
        </div>
      )}
      <ConfirmDialog open={confirmCancel} onOpenChange={setConfirmCancel} title="Cancel Premium?" description="You keep Premium until the end of the period you already paid for. After that your account returns to the Free plan; projects and photos above the Free limits are hidden, not deleted." confirmLabel="Cancel subscription" loading={updating} onConfirm={() => setCancel(true)} />
    </div>
  );
}

/** Local payment simulator screen (development only). */
export function MockCheckout({ paymentId, amount }: { paymentId: string; amount: number }) {
  const [busy, setBusy] = useState<string | null>(null);
  async function settle(outcome: 'paid' | 'failed') {
    setBusy(outcome);
    try {
      await api('/api/dev/mock-pay', { method: 'POST', body: { paymentId, outcome } });
      window.location.assign(`/account/subscription?payment=${paymentId}`);
    } catch (err) {
      toast.error(errorMessage(err));
      setBusy(null);
    }
  }
  return (
    <div className="grid gap-3">
      <p className="text-3xl font-semibold tabular-nums">{formatPHP(amount)}</p>
      <Button variant="accent" loading={busy === 'paid'} onClick={() => void settle('paid')}>
        Simulate successful payment
      </Button>
      <Button variant="outline" loading={busy === 'failed'} onClick={() => void settle('failed')}>
        Simulate failed payment
      </Button>
      <Button asChild variant="ghost">
        <a href={`/account/subscription?payment=${paymentId}&cancelled=1`}>Cancel</a>
      </Button>
    </div>
  );
}
