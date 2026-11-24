'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Pencil } from 'lucide-react';
import { toast } from 'sonner';
import { api, errorMessage } from '@/lib/api-client';
import { isProfessionalIntent } from '@/lib/community';
import { MAX_SPECIALIZATIONS, specializationsFor } from '@/lib/professions';
import type { ProfileUpdateInput } from '@/lib/validation';
import { IntentPicker } from '../intent-picker';
import { ChipSelect, LocationFields, useLocations } from '../location-fields';
import { ProfessionPicker } from '../profession-picker';
import { Button } from '../ui/button';
import { Dialog, DialogContent, DialogTrigger } from '../ui/dialog';
import { Field, Input, Select, Textarea } from '../ui/form';
import { Alert } from '../ui/misc';

export type EditableProfile = ProfileUpdateInput;

export function ProfileEditor({ initial }: { initial: EditableProfile }) {
  const router = useRouter();
  const locations = useLocations();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(initial);
  const [servicesText, setServicesText] = useState(initial.services.join('\n'));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const set = <K extends keyof EditableProfile>(key: K, value: EditableProfile[K]) => setForm((f) => ({ ...f, [key]: value }));

  const professional = isProfessionalIntent(form.intent);
  const availableSpecs = professional ? specializationsFor(form.professions) : [];

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    const services = servicesText.split('\n').map((s) => s.trim()).filter(Boolean);
    try {
      await api('/api/profile', { method: 'PATCH', body: { ...form, services: professional ? services : [], professions: professional ? form.professions : [], specializations: form.specializations.filter((s) => availableSpecs.includes(s)) } });
      toast.success('Profile updated');
      setOpen(false);
      router.refresh();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setForm(initial);
          setServicesText(initial.services.join('\n'));
          setError(null);
        }
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm">
          <Pencil aria-hidden /> Edit profile
        </Button>
      </DialogTrigger>
      <DialogContent title="Edit profile" description="Changes appear on your public page right away." className="sm:max-w-2xl">
        <form onSubmit={save} className="grid gap-5" noValidate>
          {error && <Alert variant="destructive">{error}</Alert>}
          <IntentPicker value={form.intent} onChange={(v) => set('intent', v)} legend="I am on Tibay because…" idPrefix="pe-intent" />
          <Field label={professional ? 'Business or display name' : 'Your name'} htmlFor="pe-name" required>
            <Input id="pe-name" value={form.businessName} maxLength={80} onChange={(e) => set('businessName', e.target.value)} />
          </Field>
          <Field label="About" htmlFor="pe-bio" hint={`${form.bio.length}/1500 — what you build, how long you have been doing it, what clients can expect.`}>
            <Textarea id="pe-bio" rows={5} value={form.bio} maxLength={1500} aria-describedby="pe-bio-help" onChange={(e) => set('bio', e.target.value)} />
          </Field>
          {professional && <ProfessionPicker legend="Professions" value={form.professions} onChange={(v) => set('professions', v)} idPrefix="pe-prof" />}
          {availableSpecs.length > 0 && (
            <ChipSelect legend="Specializations" hint={`Up to ${MAX_SPECIALIZATIONS}. Clients can filter the directory by these.`} options={availableSpecs.map((s) => ({ value: s, label: s }))} selected={form.specializations.filter((s) => availableSpecs.includes(s))} onChange={(v) => set('specializations', v)} max={MAX_SPECIALIZATIONS} />
          )}
          {professional && (
            <Field label="Services offered" htmlFor="pe-services" hint="One service per line, up to 15.">
              <Textarea id="pe-services" rows={4} value={servicesText} aria-describedby="pe-services-help" onChange={(e) => setServicesText(e.target.value)} placeholder={'House construction\nRenovation\nRoofing'} />
            </Field>
          )}
          <Field label="Years of experience" htmlFor="pe-years">
            <Input id="pe-years" type="number" min={0} max={70} inputMode="numeric" value={form.yearsExperience ?? ''} onChange={(e) => set('yearsExperience', e.target.value === '' ? null : Math.max(0, Math.min(70, Math.trunc(Number(e.target.value)))))} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <LocationFields idPrefix="pe" province={form.province} city={form.city} onChange={(v) => setForm((f) => ({ ...f, ...v }))} />
          </div>
          <Field label="Service coverage" htmlFor="pe-areas" hint="Other provinces where you accept projects (up to 15).">
            <Select
              id="pe-areas"
              value=""
              aria-describedby="pe-areas-help"
              onChange={(e) => e.target.value && form.serviceAreas.length < 15 && set('serviceAreas', [...new Set([...form.serviceAreas, e.target.value])])}
            >
              <option value="">Add a province…</option>
              {Object.keys(locations ?? {}).filter((p) => !form.serviceAreas.includes(p)).map((p) => (
                <option key={p}>{p}</option>
              ))}
            </Select>
          </Field>
          {form.serviceAreas.length > 0 && (
            <ul className="-mt-2 flex flex-wrap gap-2">
              {form.serviceAreas.map((area) => (
                <li key={area}>
                  <button type="button" className="rounded-full border px-3 py-1.5 text-sm hover:bg-muted" onClick={() => set('serviceAreas', form.serviceAreas.filter((a) => a !== area))} aria-label={`Remove ${area}`}>
                    {area} ×
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Mobile number" htmlFor="pe-phone" hint="Shown publicly on your profile.">
              <Input id="pe-phone" type="tel" value={form.phone} placeholder="0917 123 4567" aria-describedby="pe-phone-help" onChange={(e) => set('phone', e.target.value)} />
            </Field>
            <Field label="Contact email" htmlFor="pe-email" hint="Receives quotation requests. Never shown publicly.">
              <Input id="pe-email" type="email" value={form.contactEmail} aria-describedby="pe-email-help" onChange={(e) => set('contactEmail', e.target.value)} />
            </Field>
            <Field label="Facebook page" htmlFor="pe-fb">
              <Input id="pe-fb" type="url" value={form.facebookUrl} placeholder="https://facebook.com/yourpage" onChange={(e) => set('facebookUrl', e.target.value)} />
            </Field>
            <Field label="Messenger link" htmlFor="pe-msgr">
              <Input id="pe-msgr" type="url" value={form.messengerUrl} placeholder="https://m.me/yourpage" onChange={(e) => set('messengerUrl', e.target.value)} />
            </Field>
          </div>
          <label className="flex items-start gap-3 rounded-md border p-3 text-sm">
            <input type="checkbox" className="mt-0.5 size-4 accent-[var(--color-primary)]" checked={form.isPublished} onChange={(e) => set('isPublished', e.target.checked)} />
            <span>
              <span className="font-medium">Show my profile publicly</span>
              <span className="block text-muted-foreground">Turn off to hide your page and remove it from the directory.</span>
            </span>
          </label>
          <div className="sticky -bottom-5 -mx-5 -mb-5 flex justify-end gap-2 border-t bg-background px-5 py-3">
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={saving}>
              Save changes
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
