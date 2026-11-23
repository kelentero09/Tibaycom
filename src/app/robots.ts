import type { MetadataRoute } from 'next';
import { getEnv } from '@/server/db';

export const dynamic = 'force-dynamic';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: '*', allow: '/', disallow: ['/admin', '/api/', '/account', '/quotations', '/onboarding'] }],
    sitemap: `${getEnv().PUBLIC_SITE_URL}/sitemap.xml`,
  };
}
