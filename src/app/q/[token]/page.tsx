import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { cache } from 'react';
import { Phone } from 'lucide-react';
import { PublicQuotationActions } from '@/components/quotations/quotation-actions';
import { QuotationDocumentView } from '@/components/quotations/quotation-document';
import { Button } from '@/components/ui/button';
import { getSharedQuotation } from '@/server/quotations';
import { brandingFor, toDocument } from '../../(site)/quotations/shared';

type Props = { params: Promise<{ token: string }> };
const load = cache((token: string) => getSharedQuotation(token));

/** Private-by-link page: never indexed, never cached by intermediaries, and it sends no referrer when the client clicks away. */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const data = await load((await params).token);
  return {
    title: data ? `Quotation ${data.row.number} — ${data.profile.businessName}` : 'Quotation not found',
    robots: { index: false, follow: false, nocache: true },
    referrer: 'no-referrer',
  };
}

export default async function SharedQuotationPage({ params }: Props) {
  const data = await load((await params).token);
  if (!data) notFound();
  const { row, profile, entitlements, accountEmail } = data;
  const branding = brandingFor(profile, entitlements, accountEmail);
  const document = toDocument(row);
  const telHref = profile.phone ? `tel:${profile.phone.replace(/[^+\d]/g, '')}` : null;

  return (
    <main id="main" className="flex-1 bg-subtle/60">
      <div className="container-page grid max-w-4xl animate-rise gap-5 py-6 sm:py-10">
        <div className="flex flex-wrap items-center justify-between gap-3" data-no-print>
          <p className="text-sm text-muted-foreground">
            Quotation from{' '}
            <Link href={`/p/${profile.username}`} className="font-medium text-foreground underline-offset-4 hover:underline">
              {profile.businessName}
            </Link>
          </p>
          {telHref && (
            <Button asChild variant="outline" size="sm">
              <a href={telHref}>
                <Phone aria-hidden /> Call {profile.phone}
              </a>
            </Button>
          )}
        </div>
        <PublicQuotationActions quotation={document} branding={branding} />
        <QuotationDocumentView document={document} branding={branding} />
        {branding.showPlatformFooter && (
          <p className="text-center text-sm text-muted-foreground" data-no-print>
            Made with{' '}
            <Link href="/" className="font-medium text-foreground underline-offset-4 hover:underline">
              Tibay
            </Link>{' '}
            — quotations and profiles for Filipino builders.
          </p>
        )}
      </div>
    </main>
  );
}
