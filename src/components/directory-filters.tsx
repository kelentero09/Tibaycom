'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Search, SlidersHorizontal, X } from 'lucide-react';
import { DIRECTORY_INTENTS, INTENT_INFO } from '@/lib/community';
import { ALL_SPECIALIZATIONS, PROFESSIONS, specializationsFor } from '@/lib/professions';
import { LocationFields } from './location-fields';
import { Button } from './ui/button';
import { Field, Input, Select } from './ui/form';

type Filters = { q: string; intent: string; profession: string; specialization: string; province: string; city: string };

export function DirectoryFilters({ initial }: { initial: Filters }) {
  const router = useRouter();
  const [filters, setFilters] = useState(initial);
  const [expanded, setExpanded] = useState(false);
  const [pending, startTransition] = useTransition();
  const activeCount = [filters.intent, filters.profession, filters.specialization, filters.province, filters.city].filter(Boolean).length;

  const apply = (next: Filters) => {
    const params = new URLSearchParams(Object.entries(next).filter(([, value]) => value));
    startTransition(() => router.push(`/directory${params.size ? `?${params}` : ''}`));
  };
  const update = (patch: Partial<Filters>) => {
    const next = { ...filters, ...patch };
    setFilters(next);
    apply(next);
  };
  const specs = filters.profession ? specializationsFor([filters.profession]) : ALL_SPECIALIZATIONS;

  return (
    <form
      role="search"
      aria-label="Search professionals"
      className="grid gap-3 rounded-xl border bg-background p-4 shadow-card"
      onSubmit={(e) => {
        e.preventDefault();
        apply(filters);
      }}
    >
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input aria-label="Search by name" placeholder="Search by business name" className="pl-9" value={filters.q} maxLength={60} onChange={(e) => setFilters({ ...filters, q: e.target.value })} />
        </div>
        <Button type="submit" loading={pending}>
          Search
        </Button>
      </div>
      <Button variant="outline" size="sm" className="sm:hidden" aria-expanded={expanded} aria-controls="directory-filters" onClick={() => setExpanded((v) => !v)}>
        <SlidersHorizontal aria-hidden /> Filters{activeCount ? ` (${activeCount})` : ''}
      </Button>
      <div id="directory-filters" className={`${expanded ? 'grid' : 'hidden'} gap-3 sm:grid sm:grid-cols-2 lg:grid-cols-5`}>
        <Field label="Looking for" htmlFor="f-intent">
          <Select id="f-intent" value={filters.intent} onChange={(e) => update({ intent: e.target.value })}>
            <option value="">Everyone</option>
            {DIRECTORY_INTENTS.map((i) => (
              <option key={i} value={i}>
                {INTENT_INFO[i].short}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Profession" htmlFor="f-profession">
          <Select id="f-profession" value={filters.profession} onChange={(e) => update({ profession: e.target.value, specialization: '' })}>
            <option value="">All professions</option>
            {PROFESSIONS.map((p) => (
              <option key={p.slug} value={p.slug}>
                {p.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Specialization" htmlFor="f-spec">
          <Select id="f-spec" value={filters.specialization} onChange={(e) => update({ specialization: e.target.value })}>
            <option value="">All specializations</option>
            {specs.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </Select>
        </Field>
        <LocationFields optional idPrefix="f" province={filters.province} city={filters.city} onChange={(v) => update(v)} />
      </div>
      {(activeCount > 0 || filters.q) && (
        <div>
          <Button variant="ghost" size="sm" onClick={() => update({ q: '', intent: '', profession: '', specialization: '', province: '', city: '' })}>
            <X aria-hidden /> Clear all
          </Button>
        </div>
      )}
    </form>
  );
}
