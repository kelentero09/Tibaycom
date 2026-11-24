'use client';

import { Hammer, HardHat, House, Users } from 'lucide-react';
import { INTENT_INFO, INTENTS, type Intent } from '@/lib/community';
import { cn } from '@/lib/utils';

const ICONS: Record<Intent, React.ComponentType<{ className?: string }>> = {
  seeking_clients: HardHat,
  hiring: Users,
  seeking_work: Hammer,
  seeking_contractor: House,
};

/** Four large radio cards: what the member is on Tibay for. */
export function IntentPicker({ value, onChange, legend = 'What brings you to Tibay?', idPrefix = 'intent' }: { value: Intent | null; onChange: (intent: Intent) => void; legend?: string; idPrefix?: string }) {
  return (
    <fieldset className="grid gap-2.5">
      <legend className="mb-2.5 text-sm font-medium">{legend}</legend>
      <div className="grid gap-2.5 sm:grid-cols-2">
        {INTENTS.map((intent) => {
          const Icon = ICONS[intent];
          const checked = value === intent;
          const id = `${idPrefix}-${intent}`;
          return (
            <label
              key={intent}
              htmlFor={id}
              className={cn(
                'flex cursor-pointer gap-3 rounded-xl border bg-background p-4 shadow-card transition-colors hover:border-primary/60 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring',
                checked && 'border-primary bg-primary/5 ring-1 ring-primary',
              )}
            >
              <input id={id} type="radio" name={idPrefix} value={intent} checked={checked} onChange={() => onChange(intent)} className="sr-only" />
              <Icon className={cn('mt-0.5 size-5 shrink-0', checked ? 'text-primary' : 'text-muted-foreground')} aria-hidden />
              <span className="grid gap-0.5">
                <span className="font-medium">{INTENT_INFO[intent].label}</span>
                <span className="text-sm text-muted-foreground">{INTENT_INFO[intent].description}</span>
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
