'use client';

import { useState } from 'react';
import { Plus, X } from 'lucide-react';
import { isProfession, MAX_PROFESSIONS, normalizeProfession, PROFESSIONS } from '@/lib/professions';
import { ChipSelect } from './location-fields';
import { Button } from './ui/button';
import { Input, Label } from './ui/form';

type Props = { value: string[]; onChange: (next: string[]) => void; legend: string; idPrefix?: string };

/**
 * Pick several professions from the list, and/or type ones that are not listed ("Other").
 * Listed choices are stored as slugs (so directory filters work); typed ones are stored as written.
 */
export function ProfessionPicker({ value, onChange, legend, idPrefix = 'prof' }: Props) {
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const listed = value.filter(isProfession);
  const custom = value.filter((v) => !isProfession(v));
  const full = value.length >= MAX_PROFESSIONS;

  function addCustom() {
    const cleaned = normalizeProfession(draft);
    if (!draft.trim()) return;
    if (!cleaned) return setError('Use 2–40 letters or numbers, e.g. “Scaffolder” or “Drywall installer”.');
    if (value.some((v) => v.toLowerCase() === cleaned.toLowerCase())) return setError('You have already added that.');
    if (full) return setError(`You can choose up to ${MAX_PROFESSIONS}.`);
    onChange([...value, cleaned]);
    setDraft('');
    setError(null);
  }

  return (
    <div className="grid gap-3">
      <ChipSelect
        legend={legend}
        hint={`Choose all that apply — up to ${MAX_PROFESSIONS}. ${value.length} selected.`}
        options={PROFESSIONS.map((p) => ({ value: p.slug, label: p.label }))}
        selected={listed}
        // Keep typed professions when the listed selection changes; the cap applies to both together.
        onChange={(next) => onChange([...next, ...custom].slice(0, MAX_PROFESSIONS))}
        max={Math.max(listed.length, MAX_PROFESSIONS - custom.length)}
      />
      {custom.length > 0 && (
        <ul className="flex flex-wrap gap-2" aria-label="Other professions you added">
          {custom.map((name) => (
            <li key={name}>
              <button type="button" onClick={() => onChange(value.filter((v) => v !== name))} className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-primary bg-primary px-3 text-sm text-primary-foreground hover:opacity-90" aria-label={`Remove ${name}`}>
                {name} <X className="size-3.5" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="grid gap-1.5">
        <Label htmlFor={`${idPrefix}-other`}>Other (not in the list)</Label>
        <div className="flex gap-2">
          <Input
            id={`${idPrefix}-other`}
            value={draft}
            maxLength={40}
            disabled={full}
            placeholder={full ? `Maximum of ${MAX_PROFESSIONS} reached` : 'Type your trade, e.g. Scaffolder'}
            aria-describedby={error ? `${idPrefix}-other-error` : undefined}
            aria-invalid={!!error}
            onChange={(e) => (setDraft(e.target.value), setError(null))}
            onKeyDown={(e) => {
              // Enter adds the profession instead of submitting the surrounding form.
              if (e.key === 'Enter') {
                e.preventDefault();
                addCustom();
              }
            }}
          />
          <Button variant="outline" disabled={full || !draft.trim()} onClick={addCustom}>
            <Plus aria-hidden /> Add
          </Button>
        </div>
        {error && (
          <p id={`${idPrefix}-other-error`} role="alert" className="text-xs text-destructive">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
