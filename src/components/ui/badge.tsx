import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-ring',
  {
    variants: {
      variant: {
        default: 'bg-primary/15 text-primary border border-primary/20',
        secondary: 'bg-secondary text-secondary-foreground border border-border',
        destructive: 'bg-destructive/15 text-[#f87171] border border-destructive/20',
        outline: 'text-foreground border border-border',
        success: 'bg-[#2da44e]/15 text-[#3fb950] border border-[#2da44e]/20',
        warning: 'bg-[#bf8700]/15 text-[#d29922] border border-[#bf8700]/20',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
