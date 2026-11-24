import { AdminListPage, type ListSearchParams } from '@/components/admin/list-page';
import { requireAdmin } from '@/server/auth';

export const metadata = { title: 'Reports' };

export default async function AdminReportsPage({ searchParams }: { searchParams: ListSearchParams }) {
  await requireAdmin();
  return (
    <AdminListPage
      title="Content reports"
      description="Profiles reported by visitors, and community posts and comments reported by members. Review, then resolve or dismiss."
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
        { key: 'target', header: 'Reported', type: 'badge', badges: { post: 'warning', comment: 'warning' } },
        { key: 'excerpt', header: 'Content' },
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
        { label: 'Hide post', action: 'post.hide', payload: { postId: 'postId' }, showWhen: { key: 'target', equals: 'post' }, destructive: true, confirm: { title: 'Hide this post?', description: 'It disappears from the feed and the author’s profile. You can restore it from Community.' } },
        { label: 'Hide comment', action: 'comment.hide', payload: { commentId: 'commentId' }, showWhen: { key: 'target', equals: 'comment' }, destructive: true, confirm: { title: 'Hide this comment?', description: 'It disappears from the post for everyone.' } },
        { label: 'Hide review', action: 'review.hide', payload: { reviewId: 'reviewId' }, showWhen: { key: 'target', equals: 'review' }, destructive: true, confirm: { title: 'Hide this review?', description: 'It disappears from the profile and no longer counts toward the rating. You can restore it from Reviews.' } },
        { label: 'Mark resolved', action: 'report.resolve', payload: { reportId: 'id' }, showWhen: { key: 'status', equals: 'open' } },
        { label: 'Dismiss report', action: 'report.dismiss', payload: { reportId: 'id' }, showWhen: { key: 'status', equals: 'open' } },
      ]}
    />
  );
}
