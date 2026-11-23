import * as React from 'react';
import { cn } from '@/lib/utils';

const control =
  'w-full rounded-md border border-input bg-background px-3 text-base sm:text-sm placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive';

export function Input({ className, ...props }: React.ComponentProps<'input'>) {
  return <input className={cn(control, 'h-11', className)} {...props} />;
}

export function Textarea({ className, ...props }: React.ComponentProps<'textarea'>) {
  return <textarea className={cn(control, 'min-h-24 py-2.5', className)} {...props} />;
}

export function Select({ className, children, ...props }: React.ComponentProps<'select'>) {
  return (
    <select className={cn(control, 'h-11 appearance-none bg-[length:1rem] bg-[right_0.75rem_center] bg-no-repeat pr-9', className)}
      style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%2364748b' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")` }}
      {...props}>
      {children}
    </select>
  );
}

export function Label({ className, ...props }: React.ComponentProps<'label'>) {
  return <label className={cn('text-sm font-medium', className)} {...props} />;
}

type FieldProps = { label: string; htmlFor: string; hint?: string; error?: string; required?: boolean; className?: string; children: React.ReactNode };

/** Label + control + hint/error, wired for screen readers. Pass `aria-describedby={`${id}-help`}` on the control. */
export function Field({ label, htmlFor, hint, error, required, className, children }: FieldProps) {
  return (
    <div className={cn('grid gap-1.5', className)}>
      <Label htmlFor={htmlFor}>
        {label}
        {required && <span className="text-destructive" aria-hidden> *</span>}
      </Label>
      {children}
      {(error || hint) && (
        <p id={`${htmlFor}-help`} role={error ? 'alert' : undefined} className={cn('text-xs', error ? 'text-destructive' : 'text-muted-foreground')}>
          {error ?? hint}
        </p>
      )}
    </div>
  );
}
