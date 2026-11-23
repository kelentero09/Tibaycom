import Link from 'next/link';
import { ArrowRight, FileText, Images, QrCode, Search } from 'lucide-react';
import { PricingTable } from '@/components/pricing-table';
import { ProfessionalCard } from '@/components/professional-card';
import { Button } from '@/components/ui/button';
import { PROFESSIONS } from '@/lib/professions';
import { getPlanConfig } from '@/server/entitlements';
import { searchDirectory } from '@/server/profiles';

const features = [
  { icon: Images, title: 'A portfolio that sells for you', body: 'Show finished projects with photos on your own page — tibay.ph/p/your-name. Works beautifully on any phone.' },
  { icon: FileText, title: 'Quotations in minutes', body: 'Add materials, labor and services. Totals, discounts and VAT are computed for you. Download a clean PDF.' },
  { icon: Search, title: 'Get found by clients', body: 'Appear in a directory clients can filter by profession, specialization, province and city.' },
  { icon: QrCode, title: 'Share anywhere', body: 'Download your QR code for calling cards, tarpaulins and vehicles. Share to Facebook in one tap.' },
];

const featuredProfessions = ['general-contractor', 'architect', 'civil-engineer', 'electrician', 'plumber', 'carpenter', 'painter', 'welder'];

export default async function HomePage() {
  const [config, latest] = await Promise.all([getPlanConfig(), searchDirectory({ page: 1 })]);
  return (
    <>
      <section className="border-b bg-subtle">
        <div className="container-page grid gap-6 py-14 sm:py-20">
          <h1 className="max-w-2xl text-4xl font-semibold leading-tight sm:text-5xl">The online home of Filipino builders.</h1>
          <p className="max-w-xl text-lg text-muted-foreground">
            Tibay gives contractors, architects, engineers and skilled workers a professional profile, a project portfolio and a quotation maker — free to start.
          </p>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Button asChild size="lg" variant="accent">
              <Link href="/register">
                Create your free profile <ArrowRight aria-hidden />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="/directory">Find a professional</Link>
            </Button>
          </div>
        </div>
      </section>

      <section className="container-page grid gap-8 py-14" aria-labelledby="features-heading">
        <h2 id="features-heading" className="text-2xl font-semibold">
          Built for how you actually work
        </h2>
        <ul className="grid gap-4 sm:grid-cols-2">
          {features.map(({ icon: Icon, title, body }) => (
            <li key={title} className="grid gap-2 rounded-lg border p-5">
              <Icon className="size-5 text-accent" aria-hidden />
              <h3 className="font-semibold">{title}</h3>
              <p className="text-sm leading-relaxed text-muted-foreground">{body}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="border-y bg-subtle" aria-labelledby="browse-heading">
        <div className="container-page grid gap-6 py-14">
          <div className="flex items-end justify-between gap-4">
            <h2 id="browse-heading" className="text-2xl font-semibold">
              Looking for someone to build?
            </h2>
            <Link href="/directory" className="hidden text-sm font-medium text-accent underline-offset-4 hover:underline sm:block">
              Browse all
            </Link>
          </div>
          <ul className="flex flex-wrap gap-2">
            {featuredProfessions.map((slug) => (
              <li key={slug}>
                <Link href={`/directory?profession=${slug}`} className="inline-flex min-h-10 items-center rounded-full border bg-background px-4 text-sm hover:border-foreground/40">
                  {PROFESSIONS.find((p) => p.slug === slug)?.label}
                </Link>
              </li>
            ))}
          </ul>
          {latest.results.length > 0 && (
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {latest.results.slice(0, 6).map((pro) => (
                <li key={pro.id}>
                  <ProfessionalCard pro={pro} />
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section className="container-page grid gap-8 py-14" aria-labelledby="pricing-heading">
        <div className="grid gap-1">
          <h2 id="pricing-heading" className="text-2xl font-semibold">
            Simple, honest pricing
          </h2>
          <p className="text-muted-foreground">Start free. Upgrade only when your business needs more.</p>
        </div>
        <PricingTable config={config} freeHref="/register" premiumHref="/pricing" compact />
        <Link href="/pricing" className="text-sm font-medium text-accent underline-offset-4 hover:underline">
          Compare all features
        </Link>
      </section>
    </>
  );
}
