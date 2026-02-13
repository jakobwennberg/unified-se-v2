import * as React from 'react';
import { cn } from '@/lib/utils';

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {}

const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, children, ...props }, ref) => (
    <select
      className={cn(
        'flex h-10 w-full rounded-md border border-input bg-[#0d1321] px-3 py-2 text-sm text-foreground ring-offset-background transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:border-primary/50 disabled:cursor-not-allowed disabled:opacity-40',
        className,
      )}
      ref={ref}
      {...props}
    >
      {children}
    </select>
  ),
);
Select.displayName = 'Select';

export { Select };
