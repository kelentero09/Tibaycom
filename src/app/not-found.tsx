import Link from 'next/link';
import { Compass } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/misc';

export default function NotFound() {
  return (
    <main className="container-page flex flex-1 items-center justify-center py-20">
      <EmptyState
        className="w-full max-w-md border-none"
        icon={<Compass />}
        title="Page not found"
        description="The page or profile you are looking for does not exist or is no longer public."
        action={
          <div className="flex gap-2">
            <Button asChild>
              <Link href="/">Go home</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/directory">Browse directory</Link>
            </Button>
          </div>
        }
      />
    </main>
  );
}
