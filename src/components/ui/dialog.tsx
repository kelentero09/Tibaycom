'use client';

import * as React from 'react';
import { AlertDialog as AlertPrimitive, Dialog as DialogPrimitive } from 'radix-ui';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from './button';

// `data-overlay` / `data-panel` hook into the enter/exit animations in globals.css.
const overlay = 'fixed inset-0 z-50 bg-slate-950/55 backdrop-blur-[2px]';
const panel =
  'fixed inset-x-0 bottom-0 z-50 max-h-[92dvh] w-full overflow-y-auto rounded-t-2xl border bg-background p-5 shadow-float sm:inset-x-auto sm:bottom-auto sm:left-1/2 sm:top-1/2 sm:max-w-lg sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-xl';

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

type ContentProps = React.ComponentProps<typeof DialogPrimitive.Content> & { title: string; description?: string };

/** Bottom sheet on phones, centred modal on larger screens. */
export function DialogContent({ title, description, className, children, ...props }: ContentProps) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay data-overlay className={overlay} />
      <DialogPrimitive.Content data-panel className={cn(panel, className)} {...props}>
        {/* Grab handle hints that the sheet can be dismissed on phones. */}
        <div className="mx-auto -mt-1 mb-3 h-1 w-10 rounded-full bg-border sm:hidden" aria-hidden />
        <div className="mb-4 flex items-start justify-between gap-4">
          <div className="grid gap-1">
            <DialogPrimitive.Title className="text-lg font-semibold">{title}</DialogPrimitive.Title>
            <DialogPrimitive.Description className={description ? 'text-sm text-muted-foreground' : 'sr-only'}>{description ?? title}</DialogPrimitive.Description>
          </div>
          <DialogPrimitive.Close className="-m-2 rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Close">
            <X className="size-5" />
          </DialogPrimitive.Close>
        </div>
        {children}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

type ConfirmProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel?: string;
  destructive?: boolean;
  loading?: boolean;
  onConfirm: () => void | Promise<void>;
};

/** Confirmation for destructive or irreversible actions. */
export function ConfirmDialog({ open, onOpenChange, title, description, confirmLabel = 'Confirm', destructive = true, loading, onConfirm }: ConfirmProps) {
  return (
    <AlertPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <AlertPrimitive.Portal>
        <AlertPrimitive.Overlay data-overlay className={overlay} />
        <AlertPrimitive.Content data-panel className={cn(panel, 'sm:max-w-md')}>
          <AlertPrimitive.Title className="text-lg font-semibold">{title}</AlertPrimitive.Title>
          <AlertPrimitive.Description className="mt-2 text-sm leading-relaxed text-muted-foreground">{description}</AlertPrimitive.Description>
          <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <AlertPrimitive.Cancel asChild>
              <Button variant="outline">Cancel</Button>
            </AlertPrimitive.Cancel>
            <Button variant={destructive ? 'destructive' : 'primary'} loading={loading} onClick={() => void onConfirm()}>
              {confirmLabel}
            </Button>
          </div>
        </AlertPrimitive.Content>
      </AlertPrimitive.Portal>
    </AlertPrimitive.Root>
  );
}
