'use client';

import { useEffect, useState } from 'react';
import { Field, Select } from './ui/form';

type Locations = Record<string, string[]>;
let cache: Locations | null = null;

/** Lazy-loads the province → city list (kept out of the initial bundle). */
export function useLocations() {
  const [locations, setLocations] = useState<Locations | null>(cache);
  useEffect(() => {
    if (cache) return;
    let active = true;
    void import('@/data/ph-locations.json').then((mod) => {
      cache = mod.default as Locations;
      if (active) setLocations(cache);
    });
    return () => {
      active = false;
    };
  }, []);
  return locations;
}

type Props = {
  province: string;
  city: string;
  onChange: (value: { province: string; city: string }) => void;
  /** Directory filters allow "any"; profile forms require a choice. */
  optional?: boolean;
  errors?: { province?: string; city?: string };
  idPrefix?: string;
};

export function LocationFields({ province, city, onChange, optional, errors, idPrefix = 'loc' }: Props) {
  const locations = useLocations();
  const provinces = locations ? Object.keys(locations) : province ? [province] : [];
  const cities = locations?.[province] ?? (city ? [city] : []);
  return (
    <>
      <Field label="Province" htmlFor={`${idPrefix}-province`} error={errors?.province} required={!optional}>
        <Select id={`${idPrefix}-province`} name="province" value={province} onChange={(e) => onChange({ province: e.target.value, city: '' })} aria-invalid={!!errors?.province}>
          <option value="">{optional ? 'All provinces' : locations ? 'Select province' : 'Loading…'}</option>
          {provinces.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="City / Municipality" htmlFor={`${idPrefix}-city`} error={errors?.city} required={!optional}>
        <Select id={`${idPrefix}-city`} name="city" value={city} disabled={!province} onChange={(e) => onChange({ province, city: e.target.value })} aria-invalid={!!errors?.city}>
          <option value="">{optional ? 'All cities' : 'Select city / municipality'}</option>
          {cities.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </Select>
      </Field>
    </>
  );
}

type ChipProps = { options: { value: string; label: string }[]; selected: string[]; onChange: (next: string[]) => void; max: number; legend: string; hint?: string; error?: string };

/** Accessible multi-select rendered as toggle chips (checkbox semantics). */
export function ChipSelect({ options, selected, onChange, max, legend, hint, error }: ChipProps) {
  const toggle = (value: string) =>
    onChange(selected.includes(value) ? selected.filter((v) => v !== value) : selected.length < max ? [...selected, value] : selected);
  return (
    <fieldset className="grid gap-2">
      <legend className="text-sm font-medium">{legend}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => {
          const checked = selected.includes(option.value);
          const disabled = !checked && selected.length >= max;
          return (
            <label
              key={option.value}
              className={`inline-flex min-h-9 cursor-pointer items-center rounded-full border px-3 text-sm has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 ${
                checked ? 'border-primary bg-primary text-primary-foreground' : disabled ? 'cursor-not-allowed opacity-50' : 'hover:bg-muted'
              }`}
            >
              <input type="checkbox" className="sr-only" checked={checked} disabled={disabled} onChange={() => toggle(option.value)} />
              {option.label}
            </label>
          );
        })}
      </div>
      {(error || hint) && <p className={`text-xs ${error ? 'text-destructive' : 'text-muted-foreground'}`}>{error ?? hint}</p>}
    </fieldset>
  );
}
