import { AdminListPage, type ListSearchParams } from '@/components/admin/list-page';
import { requireAdmin } from '@/server/auth';

export const metadata = { title: 'Subscriptions' };

export default async function AdminSubscriptionsPage({ searchParams }: { searchParams: ListSearchParams }) {
  await requireAdmin();
  return (
    <AdminListPage
      title="Subscriptions"
      description="Premium periods. Price is what the subscriber paid for the current period (₱0 = complimentary)."
      resource="subscriptions"
      searchParams={searchParams}
      searchPlaceholder="Search email"
      statusOptions={[
        { value: 'active', label: 'Active' },
        { value: 'expired', label: 'Expired' },
        { value: 'revoked', label: 'Revoked' },
      ]}
      columns={[
        { key: 'email', header: 'Subscriber' },
        { key: 'status', header: 'Status', type: 'badge', badges: { active: 'success', expired: 'outline', revoked: 'destructive' } },
        { key: 'interval', header: 'Billing', type: 'badge' },
        { key: 'priceAmount', header: 'Price', type: 'money' },
        { key: 'periodStart', header: 'Period start', type: 'date' },
        { key: 'periodEnd', header: 'Period end', type: 'date' },
        { key: 'cancelAtPeriodEnd', header: 'Cancelled', type: 'boolean' },
      ]}
      actions={[
        { label: 'Add 30 days', action: 'subscription.grant', payload: { userId: 'userId' }, extra: { days: 30 }, confirm: { title: 'Add 30 complimentary days?', description: 'Recorded in the audit log.' } },
        {
          label: 'Revoke Premium',
          action: 'subscription.revoke',
          payload: { userId: 'userId' },
          showWhen: { key: 'status', equals: 'active' },
          destructive: true,
          confirm: { title: 'Revoke Premium now?', description: 'The account returns to the Free plan immediately. This does not refund any payment.' },
        },
      ]}
    />
  );
}
