import './globals.css';
import type { Metadata, Viewport } from 'next';
import { Toaster } from 'sonner';

// Every page reads request-scoped Cloudflare bindings, so nothing is prerendered at build time.
export const dynamic = 'force-dynamic';

const siteUrl = process.env.PUBLIC_SITE_URL || 'http://localhost:3000';

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: { default: 'Tibay — Find trusted Filipino builders', template: '%s · Tibay' },
  description: 'Tibay helps Filipino contractors, architects, engineers and skilled workers showcase projects, send professional quotations and get found by clients.',
  openGraph: { type: 'website', siteName: 'Tibay', locale: 'en_PH' },
  twitter: { card: 'summary_large_image' },
};

export const viewport: Viewport = { themeColor: '#0f172a', width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-PH">
      <body className="flex min-h-dvh flex-col">
        {children}
        <Toaster position="top-center" richColors closeButton />
      </body>
    </html>
  );
}
