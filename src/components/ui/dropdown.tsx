'use client';

import * as React from 'react';
import { DropdownMenu as Primitive } from 'radix-ui';
import { cn } from '@/lib/utils';

export const DropdownMenu = Primitive.Root;
export const DropdownMenuTrigger = Primitive.Trigger;

export function DropdownMenuContent({ className, ...props }: React.ComponentProps<typeof Primitive.Content>) {
  return (
    <Primitive.Portal>
      <Primitive.Content data-menu align="end" sideOffset={6} className={cn('z-50 min-w-52 rounded-xl border bg-background p-1.5 shadow-lift', className)} {...props} />
    </Primitive.Portal>
  );
}

export function DropdownMenuItem({ className, destructive, ...props }: React.ComponentProps<typeof Primitive.Item> & { destructive?: boolean }) {
  return (
    <Primitive.Item
      className={cn(
        'flex min-h-10 cursor-pointer items-center gap-2.5 rounded-md px-3 text-sm outline-none data-[highlighted]:bg-muted [&_svg]:size-4 [&_svg]:text-muted-foreground',
        destructive && 'text-destructive [&_svg]:text-destructive',
        className,
      )}
      {...props}
    />
  );
}

export function DropdownMenuSeparator() {
  return <Primitive.Separator className="my-1.5 h-px bg-border" />;
}

export function DropdownMenuLabel({ className, ...props }: React.ComponentProps<typeof Primitive.Label>) {
  return <Primitive.Label className={cn('px-3 py-2 text-xs text-muted-foreground', className)} {...props} />;
}
