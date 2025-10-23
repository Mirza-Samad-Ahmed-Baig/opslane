import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const inputVariants = cva(
  'flex w-full text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 transition-all duration-200',
  {
    variants: {
      variant: {
        default:
          'border border-input bg-muted/40 hover:bg-muted/60 focus-visible:bg-background focus-visible:border-foreground/40 rounded-md',
        filled:
          'border-0 bg-muted hover:bg-muted/80 focus-visible:bg-muted/60 focus-visible:ring-ring/40 rounded-md',
        flushed:
          'border-0 border-b border-input rounded-none px-0 hover:border-primary/50 focus-visible:border-primary focus-visible:ring-0',
      },
      size: {
        sm: 'h-8 px-2 py-1 text-xs',
        default: 'h-10 px-3 py-2',
        lg: 'h-12 px-4 py-3 text-base',
      },
      state: {
        default: '',
        error: 'border-destructive focus-visible:ring-destructive focus-visible:border-destructive',
        success:
          'border-status-success-border focus-visible:ring-status-success-fg focus-visible:border-status-success-border',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
      state: 'default',
    },
  }
);

export interface InputProps
  extends Omit<React.ComponentProps<'input'>, 'size'>,
    VariantProps<typeof inputVariants> {}

/**
 * Input - Enhanced form input with variants and states
 *
 * @param variant - Visual style: default (bordered), filled (background), flushed (bottom border only)
 * @param size - Size variant: sm (32px), default (40px), lg (48px)
 * @param state - Validation state: default, error (red), success (green)
 *
 * Features:
 * - Three visual variants for different UI contexts
 * - Size variants for dense/spacious layouts
 * - Validation states with color coding
 * - 200ms transitions (Calm Technology)
 * - Enhanced hover/focus feedback
 * - Accessible with proper focus rings
 *
 * Examples:
 * ```tsx
 * <Input placeholder="Default input" />
 * <Input variant="filled" placeholder="Filled input" />
 * <Input variant="flushed" placeholder="Minimal input" />
 * <Input size="sm" placeholder="Small input" />
 * <Input state="error" placeholder="Has error" />
 * <Input state="success" placeholder="Valid input" />
 * ```
 */
const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, variant, size, state, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(inputVariants({ variant, size, state }), className)}
        ref={ref}
        {...props}
      />
    );
  }
);
Input.displayName = 'Input';

export { Input, inputVariants };
