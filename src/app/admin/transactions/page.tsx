import { AdminListPage, type ListSearchParams } from '@/components/admin/list-page';
import { requireAdmin } from '@/server/auth';

export const metadata = { title: 'Transactions' };

const statuses = ['paid', 'pending', 'failed', 'expired', 'refunded'];

export default async function AdminTransactionsPage({ searchParams }: { searchParams: ListSearchParams }) {
  await requireAdmin();
  return (
    <AdminListPage
      title="Transactions"
      description="Every checkout attempt and payment. Refunds are issued from the PayMongo dashboard and sync back here by webhook."
      resource="transactions"
      searchParams={searchParams}
      searchPlaceholder="Search email, payment id or reference"
      statusOptions={statuses.map((value) => ({ value, label: value.charAt(0).toUpperCase() + value.slice(1) }))}
      columns={[
        { key: 'createdAt', header: 'Created', type: 'datetime' },
        { key: 'email', header: 'Customer' },
        { key: 'status', header: 'Status', type: 'badge', badges: { paid: 'success', pending: 'warning', failed: 'destructive', expired: 'outline', refunded: 'neutral' } },
        { key: 'interval', header: 'Plan', type: 'badge' },
        { key: 'amount', header: 'Amount', type: 'money' },
        { key: 'fee', header: 'Fee', type: 'money' },
        { key: 'netAmount', header: 'Net', type: 'money' },
        { key: 'refundedAmount', header: 'Refunded', type: 'money' },
        { key: 'paymentMethod', header: 'Method' },
        { key: 'providerPaymentId', header: 'PayMongo ID' },
        { key: 'livemode', header: 'Live', type: 'boolean' },
      ]}
    />
  );
}
