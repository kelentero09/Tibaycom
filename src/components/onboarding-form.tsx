'use client';

import { useState } from 'react';
import { api, errorMessage } from '@/lib/api-client';
import { LocationFields } from './location-fields';
import { ProfessionPicker } from './profession-picker';
import { Button } from './ui/button';
import { Field, Input } from './ui/form';
import { Alert } from './ui/misc';

const slugify = (value: string) =>
  value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 30);

export function OnboardingForm({ defaultName, siteHost }: { defaultName: string; siteHost: string }) {
  const [businessName, setBusinessName] = useState(defaultName);
  const [username, setUsername] = useState(slugify(defaultName));
  const [usernameTouched, setUsernameTouched] = useState(false);
  const [professions, setProfessions] = useState<string[]>([]);
  const [location, setLocation] = useState({ province: '', city: '' });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const result = await api<{ username: string }>('/api/profile', { method: 'POST', body: { username, businessName, professions, ...location } });
      window.location.assign(`/p/${result.username}?welcome=1`);
    } catch (err) {
      setError(errorMessage(err));
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} className="grid gap-5" noValidate>
      {error && <Alert variant="destructive">{error}</Alert>}
      <Field label="Business or display name" htmlFor="businessName" required>
        <Input
          id="businessName"
          value={businessName}
          maxLength={80}
          required
          onChange={(e) => {
            setBusinessName(e.target.value);
            if (!usernameTouched) setUsername(slugify(e.target.value));
          }}
        />
      </Field>
      <Field label="Profile link" htmlFor="username" required hint={`${siteHost}/p/${username || 'your-name'}`}>
        <Input
          id="username"
          value={username}
          maxLength={30}
          required
          autoCapitalize="none"
          spellCheck={false}
          aria-describedby="username-help"
          onChange={(e) => {
            setUsernameTouched(true);
            setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''));
          }}
        />
      </Field>
      <ProfessionPicker legend="What do you do?" value={professions} onChange={setProfessions} idPrefix="ob-prof" />
      <div className="grid gap-4 sm:grid-cols-2">
        <LocationFields province={location.province} city={location.city} onChange={setLocation} />
      </div>
      <Button type="submit" size="lg" loading={loading}>
        Create my profile
      </Button>
    </form>
  );
}
