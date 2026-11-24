import { AdminListPage, type ListSearchParams } from '@/components/admin/list-page';
import { requireAdmin } from '@/server/auth';

export const metadata = { title: 'Community' };

export default async function AdminCommunityPage({ searchParams }: { searchParams: ListSearchParams }) {
  await requireAdmin();
  return (
    <AdminListPage
      title="Community posts"
      description="Every post in the community feed, newest first. Hidden posts disappear from the feed and profiles but are kept so they can be restored. Reported comments are handled under Reports."
      resource="posts"
      searchParams={searchParams}
      exportable={false}
      emptyTitle="No posts yet"
      statusOptions={[
        { value: 'active', label: 'Visible' },
        { value: 'hidden', label: 'Hidden' },
      ]}
      columns={[
        { key: 'createdAt', header: 'Posted', type: 'datetime' },
        { key: 'businessName', header: 'Author', href: '/admin/profiles/{profileId}' },
        { key: 'kind', header: 'Kind', type: 'badge' },
        { key: 'body', header: 'Post' },
        { key: 'hearts', header: 'Hearts' },
        { key: 'comments', header: 'Comments' },
        { key: 'openReports', header: 'Open reports' },
        { key: 'status', header: 'Status', type: 'badge', badges: { active: 'success', hidden: 'destructive' } },
      ]}
      actions={[
        {
          label: 'Hide post',
          action: 'post.hide',
          payload: { postId: 'id' },
          showWhen: { key: 'status', equals: 'active' },
          destructive: true,
          confirm: { title: 'Hide this post?', description: 'It disappears from the feed and the author’s profile. You can restore it later.' },
        },
        { label: 'Restore post', action: 'post.restore', payload: { postId: 'id' }, showWhen: { key: 'status', equals: 'hidden' } },
      ]}
    />
  );
}
