import type { Metadata } from 'next';
import { ContactForm } from '@/components/contact-form';
import { Card, CardContent } from '@/components/ui/card';
import { getEnv } from '@/server/db';

export const metadata: Metadata = { title: 'Contact', description: 'Questions, feedback or a privacy request? Contact the Tibay team.', alternates: { canonical: '/contact' } };

export default function ContactPage() {
  return (
    <div className="container-page max-w-xl py-10">
      <h1 className="text-3xl font-semibold">Contact us</h1>
      <p className="mt-2 text-muted-foreground">Questions, feedback, billing concerns or data privacy requests — we read every message.</p>
      <Card className="mt-6">
        <CardContent>
          <ContactForm siteKey={getEnv().TURNSTILE_SITE_KEY} />
        </CardContent>
      </Card>
    </div>
  );
}
