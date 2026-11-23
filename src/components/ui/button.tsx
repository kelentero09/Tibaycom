import * as React from 'react';
import { Slot } from 'radix-ui';
import { cva, type VariantProps } from 'class-variance-authority';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export const buttonVariants = cva(
  // `active:scale` gives every button the same tactile press; colour/shadow transitions come from the base layer.
  'inline-flex items-center justify-center gap-2 rounded-md text-sm font-medium whitespace-nowrap select-none active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        primary: 'bg-primary text-primary-foreground shadow-card hover:bg-primary/88 hover:shadow-lift',
        accent: 'bg-accent text-accent-foreground shadow-card hover:bg-accent/90 hover:shadow-lift',
        outline: 'border border-input bg-background hover:border-foreground/30 hover:bg-subtle',
        ghost: 'hover:bg-muted',
        destructive: 'bg-destructive text-white shadow-card hover:bg-destructive/90',
        link: 'text-accent underline-offset-4 hover:underline active:scale-100',
      },
      size: { sm: 'h-9 px-3', md: 'h-11 px-4', lg: 'h-12 px-6 text-base', icon: 'size-11' },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  },
);

type ButtonProps = React.ComponentProps<'button'> & VariantProps<typeof buttonVariants> & { asChild?: boolean; loading?: boolean };

export function Button({ className, variant, size, asChild, loading, disabled, children, type, ...props }: ButtonProps) {
  if (asChild)
    return (
      <Slot.Root className={cn(buttonVariants({ variant, size }), className)} {...props}>
        {children}
      </Slot.Root>
    );
  return (
    <button type={type ?? 'button'} className={cn(buttonVariants({ variant, size }), className)} disabled={disabled || loading} aria-busy={loading || undefined} {...props}>
      {loading && <Loader2 className="animate-spin" aria-hidden />}
      {children}
    </button>
  );
}
