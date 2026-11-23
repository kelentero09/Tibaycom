import { AdminListPage, type ListSearchParams } from '@/components/admin/list-page';
import { requireAdmin } from '@/server/auth';

export const metadata = { title: 'Audit log' };

export default async function AdminAuditPage({ searchParams }: { searchParams: ListSearchParams }) {
  await requireAdmin();
  return (
    <AdminListPage
      title="Audit log"
      description="Append-only record of administrative actions, payment events and system jobs."
      resource="audit"
      searchParams={searchParams}
      searchPlaceholder="Search action, target id or actor email"
      statusOptions={[
        { value: 'admin', label: 'Admin actions' },
        { value: 'system', label: 'System' },
        { value: 'user', label: 'User' },
      ]}
      columns={[
        { key: 'createdAt', header: 'When', type: 'datetime' },
        { key: 'actorType', header: 'Actor', type: 'badge', badges: { admin: 'warning', system: 'outline', user: 'neutral' } },
        { key: 'actor', header: 'Email' },
        { key: 'action', header: 'Action' },
        { key: 'targetType', header: 'Target' },
        { key: 'targetId', header: 'Target ID' },
        { key: 'metadata', header: 'Details', type: 'json' },
        { key: 'ip', header: 'IP' },
      ]}
    />
  );
}
