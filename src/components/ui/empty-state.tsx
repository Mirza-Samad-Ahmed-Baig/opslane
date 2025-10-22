import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { motion } from 'framer-motion';
import { cn, filterMotionProps } from '@/lib/utils';
import { Button } from './button';

const emptyStateVariants = cva('flex flex-col items-center justify-center text-center', {
  variants: {
    size: {
      sm: 'py-8 px-4 gap-3',
      default: 'py-12 px-6 gap-4',
      lg: 'py-16 px-8 gap-6',
    },
  },
  defaultVariants: {
    size: 'default',
  },
});

export interface EmptyStateProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof emptyStateVariants> {
  icon?: React.ComponentType<{ className?: string }>;
  title: string;
  description?: string;
  action?: {
    label: string;
    onClick: () => void;
  };
  secondaryAction?: {
    label: string;
    onClick: () => void;
  };
}

/**
 * EmptyState - Displays empty state with icon, title, description, and actions
 *
 * @param icon - Icon component to display (e.g., lucide-react icon)
 * @param title - Primary heading text (required)
 * @param description - Supporting text (optional)
 * @param action - Primary action button config
 * @param secondaryAction - Secondary action button config
 * @param size - Size variant: sm, default, lg
 *
 * Features:
 * - Framer Motion entrance animation (fade + slide up)
 * - Size variants for different contexts
 * - Optional primary and secondary actions
 * - Accessible with semantic HTML
 * - Calm Technology compliant (300ms fade-in)
 * - Responsive spacing
 *
 * Examples:
 * ```tsx
 * <EmptyState
 *   icon={Inbox}
 *   title="No messages"
 *   description="You don't have any messages yet"
 *   action={{ label: "Compose", onClick: handleCompose }}
 * />
 *
 * <EmptyState
 *   icon={FolderOpen}
 *   title="No projects found"
 *   description="Get started by creating your first project"
 *   size="lg"
 *   action={{ label: "New Project", onClick: handleCreate }}
 *   secondaryAction={{ label: "Import", onClick: handleImport }}
 * />
 * ```
 */
export const EmptyState = React.forwardRef<HTMLDivElement, EmptyStateProps>(
  ({ className, icon: Icon, title, description, action, secondaryAction, size, ...props }, ref) => {
    return (
      <motion.div
        ref={ref}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: 'easeOut' }}
        className={cn(emptyStateVariants({ size }), className)}
        role="status"
        {...filterMotionProps(props)}
      >
        {Icon && (
          <div className="rounded-full bg-muted p-4">
            <Icon
              className={cn(
                'text-muted-foreground',
                size === 'sm' && 'h-8 w-8',
                size === 'default' && 'h-12 w-12',
                size === 'lg' && 'h-16 w-16'
              )}
              aria-hidden="true"
            />
          </div>
        )}

        <div className="space-y-2 max-w-md">
          <h3
            className={cn(
              'font-semibold text-foreground',
              size === 'sm' && 'text-base',
              size === 'default' && 'text-lg',
              size === 'lg' && 'text-xl'
            )}
          >
            {title}
          </h3>

          {description && (
            <p
              className={cn(
                'text-muted-foreground leading-relaxed',
                size === 'sm' && 'text-xs',
                size === 'default' && 'text-sm',
                size === 'lg' && 'text-base'
              )}
            >
              {description}
            </p>
          )}
        </div>

        {(action || secondaryAction) && (
          <div className="flex flex-wrap items-center justify-center gap-3 mt-2">
            {action && (
              <Button onClick={action.onClick} size={size === 'lg' ? 'lg' : 'default'}>
                {action.label}
              </Button>
            )}
            {secondaryAction && (
              <Button
                onClick={secondaryAction.onClick}
                variant="outline"
                size={size === 'lg' ? 'lg' : 'default'}
              >
                {secondaryAction.label}
              </Button>
            )}
          </div>
        )}
      </motion.div>
    );
  }
);

EmptyState.displayName = 'EmptyState';
