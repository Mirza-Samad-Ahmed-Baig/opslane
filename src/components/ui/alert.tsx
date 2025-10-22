import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { AlertCircle, Info, CheckCircle, XCircle, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn, filterMotionProps } from '@/lib/utils';

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
  dismissible?: boolean;
  onDismiss?: () => void;
}

/**
 * Alert - Reusable alert component with semantic variants
 *
 * @param variant - Alert type: info (blue), warning (yellow), success (green), error (red)
 * @param icon - Custom icon component (defaults to variant-specific icon)
 * @param title - Optional bold title text
 * @param dismissible - Shows dismiss (X) button
 * @param onDismiss - Callback when dismissed
 * @param children - Alert content
 *
 * Features:
 * - Theme-aware colors (adapts to light/dark mode)
 * - Semantic variants with appropriate icons
 * - Accessible with proper color contrast
 * - Optional title for structured content
 * - Dismissible with Framer Motion animation (200ms)
 * - Calm Technology compliant (subtle fade-out)
 */
const Alert = React.forwardRef<HTMLDivElement, AlertProps>(
  (
    { className, variant = 'info', icon, title, children, dismissible, onDismiss, ...props },
    ref
  ) => {
    const [isVisible, setIsVisible] = React.useState(true);
    const Icon = icon || alertIconMap[variant || 'info'];

    const handleDismiss = () => {
      setIsVisible(false);
      setTimeout(() => onDismiss?.(), 200); // Wait for exit animation
    };

    return (
      <AnimatePresence>
        {isVisible && (
          <motion.div
            ref={ref}
            role="alert"
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, x: 20 }}
            transition={{ duration: 0.2 }}
            className={cn(alertVariants({ variant }), className)}
            {...filterMotionProps(props)}
          >
            <Icon className="h-5 w-5 mt-0.5 flex-shrink-0" aria-hidden="true" />
            <div className="flex-1">
              {title && <p className="font-medium mb-1">{title}</p>}
              <div>{children}</div>
            </div>
            {dismissible && (
              <button
                onClick={handleDismiss}
                className="flex-shrink-0 rounded-md p-1 hover:bg-black/10 dark:hover:bg-white/10 transition-colors focus-standard"
                aria-label="Dismiss alert"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    );
  }
);
Alert.displayName = 'Alert';

export { Alert, alertVariants };
