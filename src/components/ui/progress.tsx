import * as React from 'react';
import * as ProgressPrimitive from '@radix-ui/react-progress';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const progressVariants = cva('relative overflow-hidden rounded-full bg-primary/20', {
  variants: {
    size: {
      sm: 'h-1',
      default: 'h-2',
      lg: 'h-3',
    },
  },
  defaultVariants: {
    size: 'default',
  },
});

interface ProgressProps
  extends React.ComponentPropsWithoutRef<typeof ProgressPrimitive.Root>,
    VariantProps<typeof progressVariants> {
  showLabel?: boolean;
  label?: string;
}

/**
 * Progress - Progress indicator with label and size variants
 *
 * @param value - Progress value (0-100)
 * @param size - Size variant: sm (4px), default (8px), lg (12px)
 * @param showLabel - Display percentage label above bar
 * @param label - Custom label text (defaults to "Progress")
 *
 * Features:
 * - Smooth 500ms transitions (Calm Technology)
 * - Size variants for different contexts
 * - Optional percentage label
 * - Accessible with ARIA attributes
 */
const Progress = React.forwardRef<React.ElementRef<typeof ProgressPrimitive.Root>, ProgressProps>(
  ({ className, value, size, showLabel, label, ...props }, ref) => (
    <div className="space-y-2 w-full">
      {showLabel && (
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">{label || 'Progress'}</span>
          <span className="font-medium">{value}%</span>
        </div>
      )}
      <ProgressPrimitive.Root
        ref={ref}
        className={cn(progressVariants({ size }), 'w-full', className)}
        {...props}
      >
        <ProgressPrimitive.Indicator
          className="h-full w-full flex-1 bg-primary transition-all duration-500 ease-out"
          style={{ transform: `translateX(-${100 - (value || 0)}%)` }}
        />
      </ProgressPrimitive.Root>
    </div>
  )
);
Progress.displayName = ProgressPrimitive.Root.displayName;

export { Progress };
