'use client';

import { TriangleAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/misc';

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="container-page flex flex-1 items-center justify-center py-20">
      <EmptyState className="w-full max-w-md border-none" icon={<TriangleAlert />} title="Something went wrong" description="An unexpected error occurred. Please try again." action={<Button onClick={reset}>Try again</Button>} />
    </main>
  );
}
