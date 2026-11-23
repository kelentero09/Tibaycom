import { AdminListPage, type ListSearchParams } from '@/components/admin/list-page';
import { requireAdmin } from '@/server/auth';

export const metadata = { title: 'Reports' };

export default async function AdminReportsPage({ searchParams }: { searchParams: ListSearchParams }) {
  await requireAdmin();
  return (
    <AdminListPage
      title="Content reports"
      description="Profiles reported by visitors. Review the profile, then resolve or dismiss."
      resource="reports"
      searchParams={searchParams}
      exportable={false}
      emptyTitle="No reports"
      statusOptions={[
        { value: 'open', label: 'Open' },
        { value: 'resolved', label: 'Resolved' },
        { value: 'dismissed', label: 'Dismissed' },
      ]}
      columns={[
        { key: 'createdAt', header: 'Reported', type: 'datetime' },
        { key: 'businessName', header: 'Profile', href: '/admin/profiles/{profileId}' },
        { key: 'reason', header: 'Reason', type: 'badge', badges: { scam: 'destructive', fake: 'warning', inappropriate: 'warning' } },
        { key: 'details', header: 'Details' },
        { key: 'reporterEmail', header: 'Reporter' },
        { key: 'profileStatus', header: 'Profile status', type: 'badge', badges: { active: 'success', suspended: 'destructive' } },
        { key: 'status', header: 'Status', type: 'badge', badges: { open: 'warning', resolved: 'success', dismissed: 'outline' } },
      ]}
      actions={[
        {
          label: 'Suspend profile',
          action: 'profile.suspend',
          payload: { profileId: 'profileId' },
          showWhen: { key: 'profileStatus', equals: 'active' },
          destructive: true,
          confirm: { title: 'Suspend this profile?', description: 'It is removed from the directory and its public page stops working until restored.' },
        },
        { label: 'Mark resolved', action: 'report.resolve', payload: { reportId: 'id' }, showWhen: { key: 'status', equals: 'open' } },
        { label: 'Dismiss report', action: 'report.dismiss', payload: { reportId: 'id' }, showWhen: { key: 'status', equals: 'open' } },
      ]}
    />
  );
}
