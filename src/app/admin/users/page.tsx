import { AdminListPage, type ListSearchParams } from '@/components/admin/list-page';
import { requireAdmin } from '@/server/auth';

export const metadata = { title: 'Users' };

const grantConfirm = { description: 'Complimentary time is added to this account and recorded in the audit log.' };

export default async function AdminUsersPage({ searchParams }: { searchParams: ListSearchParams }) {
  await requireAdmin();
  return (
    <AdminListPage
      title="Users"
      description="Registered accounts, their plan and status."
      resource="users"
      searchParams={searchParams}
      searchPlaceholder="Search name or email"
      statusOptions={[
        { value: 'premium', label: 'Premium' },
        { value: 'banned', label: 'Banned' },
        { value: 'unverified', label: 'Unverified email' },
      ]}
      columns={[
        { key: 'name', header: 'Name' },
        { key: 'email', header: 'Email' },
        { key: 'username', header: 'Profile', href: '/p/{username}' },
        { key: 'plan', header: 'Plan', type: 'badge', badges: { premium: 'accent', free: 'outline' } },
        { key: 'role', header: 'Role', type: 'badge', badges: { admin: 'warning', user: 'outline' } },
        { key: 'emailVerified', header: 'Verified', type: 'boolean' },
        { key: 'banned', header: 'Banned', type: 'boolean' },
        { key: 'createdAt', header: 'Joined', type: 'date' },
      ]}
      actions={[
        {
          label: 'Ban user',
          action: 'user.ban',
          payload: { userId: 'id' },
          showWhen: { key: 'banned', notEquals: 1 },
          destructive: true,
          confirm: { title: 'Ban this user?', description: 'They are signed out immediately, cannot log in, and their profile is suspended.' },
        },
        { label: 'Unban user', action: 'user.unban', payload: { userId: 'id' }, showWhen: { key: 'banned', equals: 1 } },
        { label: 'Grant 30 days Premium', action: 'subscription.grant', payload: { userId: 'id' }, extra: { days: 30 }, confirm: { title: 'Grant 30 days of Premium?', ...grantConfirm } },
        { label: 'Grant 1 year Premium', action: 'subscription.grant', payload: { userId: 'id' }, extra: { days: 365 }, confirm: { title: 'Grant 1 year of Premium?', ...grantConfirm } },
      ]}
    />
  );
}
