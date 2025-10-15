import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { AlertCircle, Info, CheckCircle, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

const alertVariants = cva('flex items-start gap-3 p-3 rounded-md border text-sm', {
  variants: {
    variant: {
      info: 'bg-status-info-bg border-status-info-border text-status-info-fg',
      warning: 'bg-status-warning-bg border-status-warning-border text-status-warning-fg',
      success: 'bg-status-success-bg border-status-success-border text-status-success-fg',
      error: 'bg-status-error-bg border-status-error-border text-status-error-fg',
    },
  },
  defaultVariants: {
    variant: 'info',
  },
});

const alertIconMap = {
  info: Info,
  warning: AlertCircle,
  success: CheckCircle,
  error: XCircle,
};

export interface AlertProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof alertVariants> {
  icon?: React.ComponentType<{ className?: string }>;
  title?: string;
}

/**
 * Alert - Reusable alert component with semantic variants
 *
 * @param variant - Alert type: info (blue), warning (yellow), success (green), error (red)
 * @param icon - Custom icon component (defaults to variant-specific icon)
 * @param title - Optional bold title text
 * @param children - Alert content
 *
 * Features:
 * - Theme-aware colors (adapts to light/dark mode)
 * - Semantic variants with appropriate icons
 * - Accessible with proper color contrast
 * - Optional title for structured content
 */
const Alert = React.forwardRef<HTMLDivElement, AlertProps>(
  ({ className, variant = 'info', icon, title, children, ...props }, ref) => {
    const Icon = icon || alertIconMap[variant || 'info'];

    return (
      <div ref={ref} role="alert" className={cn(alertVariants({ variant }), className)} {...props}>
        <Icon className="h-5 w-5 mt-0.5 flex-shrink-0" aria-hidden="true" />
        <div className="flex-1">
          {title && <p className="font-medium mb-1">{title}</p>}
          <div>{children}</div>
        </div>
      </div>
    );
  }
);
Alert.displayName = 'Alert';

export { Alert, alertVariants };
