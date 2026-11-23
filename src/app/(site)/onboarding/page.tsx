import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { OnboardingForm } from '@/components/onboarding-form';
import { Card, CardContent } from '@/components/ui/card';
import { requireUser } from '@/server/auth';
import { getEnv } from '@/server/db';
import { getProfileByUserId } from '@/server/profiles';

export const metadata: Metadata = { title: 'Set up your profile', robots: { index: false } };

export default async function OnboardingPage() {
  const user = await requireUser('/onboarding');
  const profile = await getProfileByUserId(user.id);
  if (profile) redirect(`/p/${profile.username}`);
  return (
    <div className="container-page flex justify-center py-10">
      <Card className="w-full max-w-xl">
        <CardContent className="grid gap-6 p-6 sm:p-8">
          <div className="grid gap-1.5">
            <h1 className="text-2xl font-semibold">Set up your profile</h1>
            <p className="text-sm text-muted-foreground">Four quick details and your public page is live. Add photos and projects right after.</p>
          </div>
          <OnboardingForm defaultName={user.name} siteHost={new URL(getEnv().PUBLIC_SITE_URL).host} />
        </CardContent>
      </Card>
    </div>
  );
}
