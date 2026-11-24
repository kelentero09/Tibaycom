import { Star } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Five stars filled to `value` (halves rounded to the nearest half star). Decorative: pair it with text. */
export function Stars({ value, className }: { value: number; className?: string }) {
  const rounded = Math.round(value * 2) / 2;
  return (
    <span className={cn('inline-flex items-center gap-0.5 text-amber-500', className)} aria-hidden>
      {[1, 2, 3, 4, 5].map((n) => (
        <span key={n} className="relative inline-flex">
          <Star className="size-[1em] text-muted-foreground/30" />
          {rounded >= n - 0.5 && (
            <span className="absolute inset-0 overflow-hidden" style={{ width: rounded >= n ? '100%' : '50%' }}>
              <Star className="size-[1em] fill-current" />
            </span>
          )}
        </span>
      ))}
    </span>
  );
}

/** Compact "★ 4.5/5 (12)" shown beside a professional's name. */
export function RatingBadge({ average, count, className }: { average: number; count: number; className?: string }) {
  return (
    <span className={cn('inline-flex shrink-0 items-center gap-1 text-sm', className)} aria-label={`Rated ${average.toFixed(1)} out of 5 from ${count} review${count === 1 ? '' : 's'}`}>
      <Star className="size-4 fill-amber-500 text-amber-500" aria-hidden />
      <span className="font-semibold text-foreground">{average.toFixed(1)}</span>
      <span className="text-muted-foreground">/5</span>
      <span className="text-muted-foreground">({count})</span>
    </span>
  );
}
