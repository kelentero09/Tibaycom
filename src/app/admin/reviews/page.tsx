import { AdminListPage, type ListSearchParams } from '@/components/admin/list-page';
import { requireAdmin } from '@/server/auth';

export const metadata = { title: 'Reviews' };

export default async function AdminReviewsPage({ searchParams }: { searchParams: ListSearchParams }) {
  await requireAdmin();
  return (
    <AdminListPage
      title="Reviews"
      description="Star ratings members left on professional profiles, newest first. Hidden reviews stop counting toward the rating but are kept so they can be restored. Banning a member also removes their reviews from ratings."
      resource="reviews"
      searchParams={searchParams}
      exportable={false}
      emptyTitle="No reviews yet"
      statusOptions={[
        { value: 'active', label: 'Visible' },
        { value: 'hidden', label: 'Hidden' },
      ]}
      columns={[
        { key: 'createdAt', header: 'Written', type: 'datetime' },
        { key: 'businessName', header: 'Professional', href: '/admin/profiles/{profileId}' },
        { key: 'rating', header: 'Stars' },
        { key: 'body', header: 'Review' },
        { key: 'authorEmail', header: 'Author' },
        { key: 'verified', header: 'Contacted via Tibay', type: 'boolean' },
        { key: 'openReports', header: 'Open reports' },
        { key: 'status', header: 'Status', type: 'badge', badges: { active: 'success', hidden: 'destructive' } },
      ]}
      actions={[
        {
          label: 'Hide review',
          action: 'review.hide',
          payload: { reviewId: 'id' },
          showWhen: { key: 'status', equals: 'active' },
          destructive: true,
          confirm: { title: 'Hide this review?', description: 'It disappears from the profile and no longer counts toward the rating.' },
        },
        { label: 'Restore review', action: 'review.restore', payload: { reviewId: 'id' }, showWhen: { key: 'status', equals: 'hidden' } },
      ]}
    />
  );
}
