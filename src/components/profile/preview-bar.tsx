'use client';

import Link from 'next/link';
import { Copy, Eye, Pencil } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '../ui/button';

/** Owner-only: switch between editing the page and previewing it exactly as visitors see it. */
export function PreviewToggle({ username }: { username: string }) {
  return (
    <Button asChild variant="outline" size="sm">
      <Link href={`/p/${username}?view=public`} scroll={false}>
        <Eye aria-hidden /> Preview
      </Link>
    </Button>
  );
}

export function PreviewBar({ username, url, isPublished }: { username: string; url: string; isPublished: boolean }) {
  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      toast.success('Link copied');
    } catch {
      toast.error('Could not copy the link');
    }
  }
  return (
    <div className="border-b bg-primary text-primary-foreground" role="status">
      <div className="container-page flex flex-wrap items-center justify-between gap-2 py-2.5">
        <p className="inline-flex items-center gap-2 text-sm font-medium">
          <Eye className="size-4" aria-hidden />
          {isPublished ? 'Preview: this is exactly what visitors see.' : 'Preview: your page is hidden, so visitors cannot see it yet.'}
        </p>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" className="border-white/30 bg-transparent text-primary-foreground hover:bg-white/10" onClick={() => void copy()}>
            <Copy aria-hidden /> Copy link
          </Button>
          <Button asChild size="sm" variant="accent">
            <Link href={`/p/${username}`} scroll={false}>
              <Pencil aria-hidden /> Back to editing
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
