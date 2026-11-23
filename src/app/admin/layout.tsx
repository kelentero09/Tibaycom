import type { Metadata } from 'next';
import Link from 'next/link';
import { eq } from 'drizzle-orm';
import { AdminNav } from '@/components/admin/admin-nav';
import { Logo } from '@/components/site-shell';
import { Badge } from '@/components/ui/misc';
import { requireAdmin } from '@/server/auth';
import { getDb, schema } from '@/server/db';

export const metadata: Metadata = { title: { default: 'Admin', template: '%s · Tibay Admin' }, robots: { index: false, follow: false } };

/** Every /admin page renders inside this layout, which enforces admin role + 2FA on the server. Pages re-check too. */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const admin = await requireAdmin();
  const openReports = await getDb().$count(schema.reports, eq(schema.reports.status, 'open'));
  return (
    <div className="flex min-h-dvh flex-col lg:flex-row">
      <aside className="border-b bg-background lg:sticky lg:top-0 lg:h-dvh lg:w-60 lg:shrink-0 lg:border-b-0 lg:border-r">
        <div className="flex items-center justify-between gap-2 px-4 py-3 lg:px-5 lg:py-4">
          <span className="flex items-center gap-2">
            <Logo /> <Badge variant="accent">Admin</Badge>
          </span>
          <Link href="/" className="text-xs text-muted-foreground underline-offset-4 hover:underline lg:hidden">
            Exit
          </Link>
        </div>
        <AdminNav openReports={openReports} />
        <div className="hidden px-5 py-4 text-xs text-muted-foreground lg:block">
          <p className="truncate">{admin.email}</p>
          <Link href="/" className="underline-offset-4 hover:underline">
            Back to site
          </Link>
        </div>
      </aside>
      <main id="main" className="min-w-0 flex-1 bg-subtle/50 p-4 sm:p-6 lg:p-8">
        <div className="mx-auto max-w-6xl">{children}</div>
      </main>
    </div>
  );
}
