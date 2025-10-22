import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertCircle, RefreshCw, WifiOff, ServerCrash, Bug } from 'lucide-react';
import { cn, filterMotionProps } from '@/lib/utils';
import { Button } from './button';

/**
 * Error State Components - Inline error displays with retry functionality
 *
 * Use for:
 * - API errors with retry
 * - Form validation errors
 * - Network errors
 * - Empty states with errors
 */

const errorStateVariants = cva('rounded-lg border p-4 space-y-3', {
  variants: {
    variant: {
      default: 'border-destructive/50 bg-destructive/5',
      muted: 'border-border bg-muted',
      inline: 'border-0 bg-transparent p-0',
    },
    size: {
      sm: 'text-sm',
      default: 'text-base',
      lg: 'text-lg',
    },
  },
  defaultVariants: {
    variant: 'default',
    size: 'default',
  },
});

export interface ErrorStateProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof errorStateVariants> {
  error: Error | string;
  title?: string;
  onRetry?: () => void;
  retryLabel?: string;
  icon?: React.ComponentType<{ className?: string }>;
  showIcon?: boolean;
}

/**
 * ErrorState - Generic error display with optional retry
 *
 * @example
 * ```tsx
 * <ErrorState
 *   error={error}
 *   title="Failed to load data"
 *   onRetry={refetch}
 * />
 * ```
 */
export const ErrorState = React.forwardRef<HTMLDivElement, ErrorStateProps>(
  (
    {
      className,
      variant,
      size,
      error,
      title = 'Error',
      onRetry,
      retryLabel = 'Try Again',
      icon: Icon = AlertCircle,
      showIcon = true,
      ...props
    },
    ref
  ) => {
    const errorMessage = typeof error === 'string' ? error : error.message;

    return (
      <motion.div
        ref={ref}
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -10 }}
        transition={{ duration: 0.2 }}
        className={cn(errorStateVariants({ variant, size }), className)}
        role="alert"
        {...filterMotionProps(props)}
      >
        <div className="flex items-start gap-3">
          {showIcon && (
            <Icon
              className={cn(
                'flex-shrink-0 text-destructive',
                size === 'sm' && 'h-4 w-4 mt-0.5',
                size === 'default' && 'h-5 w-5 mt-0.5',
                size === 'lg' && 'h-6 w-6'
              )}
              aria-hidden="true"
            />
          )}

          <div className="flex-1 space-y-1">
            <p className="font-medium text-destructive">{title}</p>
            <p className="text-sm text-muted-foreground">{errorMessage}</p>

            {onRetry && (
              <Button
                onClick={onRetry}
                variant="outline"
                size={size === 'sm' ? 'sm' : 'default'}
                className="mt-3 gap-2"
              >
                <RefreshCw className="h-4 w-4" />
                {retryLabel}
              </Button>
            )}
          </div>
        </div>
      </motion.div>
    );
  }
);
ErrorState.displayName = 'ErrorState';

/**
 * NetworkError - Specialized error for network/connection issues
 */
export const NetworkError = React.forwardRef<
  HTMLDivElement,
  Omit<ErrorStateProps, 'icon' | 'title'>
>(({ error, ...props }, ref) => {
  return (
    <ErrorState
      ref={ref}
      error={error}
      title="Connection Error"
      icon={WifiOff}
      retryLabel="Reconnect"
      {...props}
    />
  );
});
NetworkError.displayName = 'NetworkError';

/**
 * ServerError - Specialized error for server/API errors
 */
export const ServerError = React.forwardRef<
  HTMLDivElement,
  Omit<ErrorStateProps, 'icon' | 'title'>
>(({ error, ...props }, ref) => {
  return (
    <ErrorState
      ref={ref}
      error={error}
      title="Server Error"
      icon={ServerCrash}
      retryLabel="Retry Request"
      {...props}
    />
  );
});
ServerError.displayName = 'ServerError';

/**
 * ValidationError - Specialized error for form validation
 */
export const ValidationError = React.forwardRef<
  HTMLDivElement,
  Omit<ErrorStateProps, 'icon' | 'variant' | 'showIcon' | 'onRetry'>
>(({ error, title = 'Validation Error', ...props }, ref) => {
  return (
    <ErrorState
      ref={ref}
      error={error}
      title={title}
      variant="inline"
      showIcon={false}
      {...props}
    />
  );
});
ValidationError.displayName = 'ValidationError';

/**
 * InlineError - Minimal inline error (for form fields)
 */
interface InlineErrorProps extends React.HTMLAttributes<HTMLDivElement> {
  error: string;
}

export const InlineError = React.forwardRef<HTMLDivElement, InlineErrorProps>(
  ({ error, className, ...props }, ref) => {
    return (
      <AnimatePresence>
        {error && (
          <motion.div
            ref={ref}
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.15 }}
            className={cn('flex items-start gap-2 text-xs text-destructive', className)}
            role="alert"
            {...filterMotionProps(props)}
          >
            <AlertCircle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" aria-hidden="true" />
            <span>{error}</span>
          </motion.div>
        )}
      </AnimatePresence>
    );
  }
);
InlineError.displayName = 'InlineError';

/**
 * QueryError - Error state for React Query with automatic retry
 */
interface QueryErrorProps extends Omit<ErrorStateProps, 'error'> {
  error: Error | null;
  isError: boolean;
  refetch: () => void;
}

export const QueryError = React.forwardRef<HTMLDivElement, QueryErrorProps>(
  ({ error, isError, refetch, ...props }, ref) => {
    if (!isError || !error) return null;

    // Detect error type
    const isNetworkError =
      error.message.toLowerCase().includes('network') ||
      error.message.toLowerCase().includes('connection');

    const Component = isNetworkError ? NetworkError : ServerError;

    return <Component ref={ref} error={error} onRetry={refetch} {...props} />;
  }
);
QueryError.displayName = 'QueryError';

/**
 * ErrorWithDebug - Error with collapsible debug info (development)
 */
interface ErrorWithDebugProps extends ErrorStateProps {
  stack?: string;
  context?: Record<string, unknown>;
}

export const ErrorWithDebug = React.forwardRef<HTMLDivElement, ErrorWithDebugProps>(
  ({ error, stack, context, ...props }, ref) => {
    const [showDebug, setShowDebug] = React.useState(false);
    const isDevelopment = import.meta.env.DEV;

    return (
      <div ref={ref} className="space-y-2">
        <ErrorState error={error} icon={Bug} {...props} />

        {isDevelopment && (stack || context) && (
          <details className="rounded-lg bg-muted p-3 border text-xs">
            <summary
              className="font-medium cursor-pointer hover:text-foreground transition-colors"
              onClick={() => setShowDebug(!showDebug)}
            >
              Debug Information
            </summary>

            <AnimatePresence>
              {showDebug && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="mt-3 space-y-3"
                >
                  {stack && (
                    <div>
                      <p className="font-medium mb-1">Stack Trace:</p>
                      <pre className="overflow-auto max-h-40 text-muted-foreground font-mono bg-background p-2 rounded border">
                        {stack}
                      </pre>
                    </div>
                  )}

                  {context && (
                    <div>
                      <p className="font-medium mb-1">Context:</p>
                      <pre className="overflow-auto max-h-40 text-muted-foreground font-mono bg-background p-2 rounded border">
                        {JSON.stringify(context, null, 2)}
                      </pre>
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </details>
        )}
      </div>
    );
  }
);
ErrorWithDebug.displayName = 'ErrorWithDebug';
