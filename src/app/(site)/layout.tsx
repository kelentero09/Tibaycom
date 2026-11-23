import { SiteFooter, SiteHeader } from '@/components/site-shell';
import { UpgradeDialogHost } from '@/components/upgrade-prompt';
import { getPlanConfig } from '@/server/entitlements';

export default async function SiteLayout({ children }: { children: React.ReactNode }) {
  const config = await getPlanConfig();
  return (
    <>
      <SiteHeader />
      <main id="main" className="flex-1">
        {children}
      </main>
      <SiteFooter />
      <UpgradeDialogHost monthly={config.pricing.monthly} annual={config.pricing.annual} premium={config.limits.premium} />
    </>
  );
}
