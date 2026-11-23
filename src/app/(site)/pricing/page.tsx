import type { Metadata } from 'next';
import { PricingTable } from '@/components/pricing-table';
import { getSession } from '@/server/auth';
import { getPlanConfig } from '@/server/entitlements';
import { getT } from '@/server/locale';

export const metadata: Metadata = {
  title: 'Pricing',
  description: 'Tibay is free to start. Premium adds more projects, unlimited branded quotations and a custom cover photo.',
  alternates: { canonical: '/pricing' },
};

const faqs = [
  { q: 'How do I pay?', a: 'Securely through PayMongo using GCash, Maya, or a debit/credit card. Tibay never sees or stores your card details.' },
  { q: 'Will I be charged automatically?', a: 'No. Premium is prepaid for one month or one year. We email you before it ends and you choose whether to renew.' },
  { q: 'What happens if I do not renew?', a: 'Your account returns to the Free plan. Nothing is deleted — projects and photos beyond the Free limits are simply hidden until you upgrade again.' },
  { q: 'Can I get a refund?', a: 'Contact us within 7 days of payment if something went wrong and we will make it right.' },
];

export default async function PricingPage() {
  const [config, session, t] = await Promise.all([getPlanConfig(), getSession(), getT()]);
  return (
    <div className="container-page grid gap-12 py-10">
      <div className="grid gap-2">
        <h1 className="text-3xl font-semibold sm:text-4xl">{t.pricing.title}</h1>
        <p className="max-w-xl text-muted-foreground">{t.pricing.subtitle}</p>
      </div>
      <PricingTable config={config} freeHref={session ? '/onboarding' : '/register'} premiumHref={session ? '/account/subscription' : '/register'} labels={t.pricing} />
      <section aria-labelledby="faq-heading" className="grid gap-4">
        <h2 id="faq-heading" className="text-xl font-semibold">
          Questions
        </h2>
        <dl className="grid gap-4 sm:grid-cols-2">
          {faqs.map((faq) => (
            <div key={faq.q} className="rounded-xl border bg-background p-5 shadow-card">
              <dt className="font-medium">{faq.q}</dt>
              <dd className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{faq.a}</dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  );
}
