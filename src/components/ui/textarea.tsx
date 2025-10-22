import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const textareaVariants = cva(
  'flex w-full rounded-md text-sm ring-offset-background placeholder:text-muted-foreground/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60 resize-y transition-all duration-200',
  {
    variants: {
      variant: {
        default:
          'border border-input bg-muted/40 hover:bg-muted/60 focus-visible:bg-background focus-visible:border-foreground/40',
        filled:
          'border-0 bg-muted hover:bg-muted/80 focus-visible:bg-muted/60 focus-visible:ring-ring/40',
      },
      size: {
        sm: 'min-h-[60px] px-2 py-1 text-xs',
        default: 'min-h-[80px] px-3 py-2',
        lg: 'min-h-[120px] px-4 py-3 text-base',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
);

export interface TextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement>,
    VariantProps<typeof textareaVariants> {}

/**
 * Textarea - Enhanced multi-line text input with variants
 *
 * @param variant - Visual style: default (bordered), filled (background)
 * @param size - Size variant: sm (60px min), default (80px min), lg (120px min)
 *
 * Features:
 * - Consistent with Input component styling
 * - Hover and focus states with 200ms transitions
 * - Resizable vertically (resize-y)
 * - Accessible with proper focus rings
 */
const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, variant, size, ...props }, ref) => {
    return (
      <textarea
        className={cn(textareaVariants({ variant, size }), className)}
        ref={ref}
        {...props}
      />
    );
  }
);
Textarea.displayName = 'Textarea';

export { Textarea, textareaVariants };
