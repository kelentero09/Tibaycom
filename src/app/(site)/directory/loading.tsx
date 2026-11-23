import { Skeleton } from '@/components/ui/misc';

export default function Loading() {
  return (
    <div className="container-page grid gap-6 py-8" role="status" aria-label="Loading">
      <Skeleton className="h-8 w-64" />
      <Skeleton className="h-24 w-full" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-28" />
        ))}
      </div>
    </div>
  );
}
