import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva('inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium', {
  variants: {
    variant: {
      neutral: 'bg-muted text-foreground',
      accent: 'bg-accent-soft text-accent',
      success: 'bg-success-soft text-success',
      warning: 'bg-warning-soft text-warning',
      destructive: 'bg-destructive-soft text-destructive',
      outline: 'border text-muted-foreground',
    },
  },
  defaultVariants: { variant: 'neutral' },
});

export type BadgeVariant = NonNullable<VariantProps<typeof badgeVariants>['variant']>;

export function Badge({ className, variant, ...props }: React.ComponentProps<'span'> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export function Skeleton({ className, ...props }: React.ComponentProps<'div'>) {
  return <div aria-hidden className={cn('skeleton-shimmer rounded-md', className)} {...props} />;
}

type StateProps = { icon?: React.ReactNode; title: string; description?: string; action?: React.ReactNode; className?: string };

/** Shared empty / error state block. */
export function EmptyState({ icon, title, description, action, className }: StateProps) {
  return (
    <div className={cn('flex animate-fade-in flex-col items-center gap-3 rounded-xl border border-dashed bg-subtle/50 px-6 py-12 text-center', className)}>
      {icon && <div className="flex size-11 items-center justify-center rounded-full bg-muted text-muted-foreground [&_svg]:size-5">{icon}</div>}
      <div className="grid gap-1">
        <p className="font-medium">{title}</p>
        {description && <p className="mx-auto max-w-sm text-sm text-muted-foreground">{description}</p>}
      </div>
      {action}
    </div>
  );
}

type AlertVariant = 'neutral' | 'warning' | 'destructive' | 'success';
const alertStyles: Record<AlertVariant, string> = {
  neutral: 'bg-subtle border-border',
  warning: 'bg-warning-soft border-warning/30 text-warning',
  destructive: 'bg-destructive-soft border-destructive/30 text-destructive',
  success: 'bg-success-soft border-success/30 text-success',
};

export function Alert({ variant = 'neutral', className, ...props }: React.ComponentProps<'div'> & { variant?: AlertVariant }) {
  return <div role={variant === 'destructive' ? 'alert' : 'status'} className={cn('animate-fade-in rounded-lg border px-4 py-3 text-sm leading-relaxed', alertStyles[variant], className)} {...props} />;
}

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="grid gap-1">
        <h1 className="text-2xl font-semibold">{title}</h1>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}
