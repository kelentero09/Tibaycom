import { AdminListPage, type ListSearchParams } from '@/components/admin/list-page';
import { requireAdmin } from '@/server/auth';

export const metadata = { title: 'Profiles' };

export default async function AdminProfilesPage({ searchParams }: { searchParams: ListSearchParams }) {
  await requireAdmin();
  return (
    <AdminListPage
      title="Profiles"
      description="Public professional profiles and their portfolio size. Open a profile to moderate its projects."
      resource="profiles"
      searchParams={searchParams}
      searchPlaceholder="Search business name or username"
      statusOptions={[
        { value: 'active', label: 'Active' },
        { value: 'suspended', label: 'Suspended' },
        { value: 'hidden', label: 'Hidden by owner' },
      ]}
      columns={[
        { key: 'businessName', header: 'Business', href: '/admin/profiles/{id}' },
        { key: 'username', header: 'Public page', href: '/p/{username}' },
        { key: 'province', header: 'Province' },
        { key: 'city', header: 'City' },
        { key: 'projects', header: 'Projects', align: 'right' },
        { key: 'photos', header: 'Photos', align: 'right' },
        { key: 'status', header: 'Status', type: 'badge', badges: { active: 'success', suspended: 'destructive' } },
        { key: 'isPublished', header: 'Published', type: 'boolean' },
        { key: 'createdAt', header: 'Created', type: 'date' },
      ]}
      actions={[
        {
          label: 'Suspend profile',
          action: 'profile.suspend',
          payload: { profileId: 'id' },
          showWhen: { key: 'status', equals: 'active' },
          destructive: true,
          confirm: { title: 'Suspend this profile?', description: 'It is removed from the directory and its public page stops working until restored.' },
        },
        { label: 'Restore profile', action: 'profile.restore', payload: { profileId: 'id' }, showWhen: { key: 'status', equals: 'suspended' } },
      ]}
    />
  );
}
