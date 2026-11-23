import { PlanSettingsForm } from '@/components/admin/plan-settings-form';
import { PageHeader } from '@/components/ui/misc';
import { requireAdmin } from '@/server/auth';
import { getPlanConfig } from '@/server/entitlements';

export const metadata = { title: 'Settings' };

export default async function AdminSettingsPage() {
  await requireAdmin();
  return (
    <div className="grid gap-6">
      <PageHeader title="Platform settings" description="Pricing and plan limits are read by the server on every request — no deploy needed." />
      <PlanSettingsForm initial={await getPlanConfig()} />
    </div>
  );
}
