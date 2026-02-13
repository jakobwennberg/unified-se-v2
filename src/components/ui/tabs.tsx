'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

interface TabsContextValue {
  value: string;
  onValueChange: (value: string) => void;
}

const TabsContext = React.createContext<TabsContextValue>({
  value: '',
  onValueChange: () => {},
});

interface TabsProps extends React.HTMLAttributes<HTMLDivElement> {
  defaultValue: string;
  value?: string;
  onValueChange?: (value: string) => void;
}

function Tabs({ defaultValue, value: controlledValue, onValueChange, className, children, ...props }: TabsProps) {
  const [uncontrolledValue, setUncontrolledValue] = React.useState(defaultValue);
  const value = controlledValue ?? uncontrolledValue;

  const handleValueChange = React.useCallback(
    (newValue: string) => {
      setUncontrolledValue(newValue);
      onValueChange?.(newValue);
    },
    [onValueChange],
  );

  return (
    <TabsContext.Provider value={{ value, onValueChange: handleValueChange }}>
      <div className={cn('', className)} {...props}>
        {children}
      </div>
    </TabsContext.Provider>
  );
}

const TabsList = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        'inline-flex h-10 items-center gap-1 border-b border-border pb-px',
        className,
      )}
      {...props}
    />
  ),
);
TabsList.displayName = 'TabsList';

interface TabsTriggerProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  value: string;
}

const TabsTrigger = React.forwardRef<HTMLButtonElement, TabsTriggerProps>(
  ({ className, value, ...props }, ref) => {
    const context = React.useContext(TabsContext);
    const isActive = context.value === value;
    return (
      <button
        ref={ref}
        className={cn(
          'inline-flex items-center justify-center whitespace-nowrap px-3 py-2 text-sm font-medium transition-all duration-200 relative',
          isActive
            ? 'text-primary'
            : 'text-muted-foreground hover:text-foreground',
          className,
        )}
        onClick={() => context.onValueChange(value)}
        {...props}
      >
        {props.children}
        {isActive && (
          <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-full" />
        )}
      </button>
    );
  },
);
TabsTrigger.displayName = 'TabsTrigger';

interface TabsContentProps extends React.HTMLAttributes<HTMLDivElement> {
  value: string;
}

const TabsContent = React.forwardRef<HTMLDivElement, TabsContentProps>(
  ({ className, value, ...props }, ref) => {
    const context = React.useContext(TabsContext);
    if (context.value !== value) return null;
    return (
      <div
        ref={ref}
        className={cn('mt-4 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring', className)}
        style={{ animation: 'fade-in 0.2s ease-out' }}
        {...props}
      />
    );
  },
);
TabsContent.displayName = 'TabsContent';

export { Tabs, TabsList, TabsTrigger, TabsContent };
