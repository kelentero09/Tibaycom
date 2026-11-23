'use client';

import { useCallback, useEffect, useState } from 'react';
import { Dialog as DialogPrimitive } from 'radix-ui';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';

type Photo = { id: string; url: string };

/**
 * Project photos: the cover (first photo) is shown large, the rest as a grid.
 * Tapping opens a full-screen viewer with swipe-free, thumb-reachable previous / next and arrow-key support.
 */
export function PhotoGallery({ photos, title }: { photos: Photo[]; title: string }) {
  const [index, setIndex] = useState<number | null>(null);
  const step = useCallback((delta: number) => setIndex((i) => (i === null ? i : (i + delta + photos.length) % photos.length)), [photos.length]);

  useEffect(() => {
    if (index === null) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'ArrowRight') step(1);
      if (event.key === 'ArrowLeft') step(-1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [index, step]);

  if (!photos.length) return null;
  const current = index === null ? null : photos[index];
  const navButton = 'absolute top-1/2 flex size-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/15 text-white backdrop-blur hover:bg-white/25';

  return (
    <>
      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {photos.map((photo, i) => (
          // The cover (first photo) spans the full width; the rest form a grid below it.
          <li key={photo.id} className={`overflow-hidden rounded-lg bg-muted ${i === 0 ? 'col-span-2 aspect-[16/9] sm:col-span-3' : 'aspect-[4/3]'}`}>
            <button type="button" onClick={() => setIndex(i)} className="group block size-full" aria-label={`Open photo ${i + 1} of ${photos.length}: ${title}`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={photo.url} alt={`${title} — photo ${i + 1}`} loading="lazy" decoding="async" data-fade className="size-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.03]" />
            </button>
          </li>
        ))}
      </ul>

      <DialogPrimitive.Root open={index !== null} onOpenChange={(open) => !open && setIndex(null)}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay data-overlay className="fixed inset-0 z-50 bg-slate-950/90" />
          <DialogPrimitive.Content className="fixed inset-0 z-50 flex items-center justify-center p-3 outline-none sm:p-8" aria-describedby={undefined}>
            <DialogPrimitive.Title className="sr-only">
              {title} — photo {(index ?? 0) + 1} of {photos.length}
            </DialogPrimitive.Title>
            {current && (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={current.id} src={current.url} alt={`${title} — photo ${(index ?? 0) + 1}`} className="max-h-full max-w-full animate-fade-in rounded-lg object-contain" />
            )}
            <DialogPrimitive.Close className="absolute right-3 top-3 flex size-11 items-center justify-center rounded-full bg-white/15 text-white backdrop-blur hover:bg-white/25" aria-label="Close">
              <X className="size-5" />
            </DialogPrimitive.Close>
            {photos.length > 1 && (
              <>
                <button type="button" onClick={() => step(-1)} className={`${navButton} left-3`} aria-label="Previous photo">
                  <ChevronLeft className="size-6" />
                </button>
                <button type="button" onClick={() => step(1)} className={`${navButton} right-3`} aria-label="Next photo">
                  <ChevronRight className="size-6" />
                </button>
                <p className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-white/15 px-3 py-1 text-sm text-white backdrop-blur" aria-hidden>
                  {(index ?? 0) + 1} / {photos.length}
                </p>
              </>
            )}
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
    </>
  );
}
