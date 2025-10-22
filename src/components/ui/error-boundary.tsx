import * as React from 'react';
import { motion } from 'framer-motion';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';
import { Button } from './button';
import { Card, CardContent, CardHeader, CardTitle } from './card';

/**
 * Error Boundary - Catches React errors and provides recovery UI
 *
 * Features:
 * - Catches component tree errors
 * - Provides retry mechanism
 * - Shows error details in development
 * - Framer Motion animations
 * - Follows design system
 *
 * Usage:
 * ```tsx
 * <ErrorBoundary fallback={<CustomError />}>
 *   <YourComponent />
 * </ErrorBoundary>
 * ```
 */

interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
  resetKeys?: unknown[];
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return {
      hasError: true,
      error,
    };
  }

  override componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    this.setState({ errorInfo });
    this.props.onError?.(error, errorInfo);

    // Log to console in development
    if (import.meta.env.DEV) {
      console.error('ErrorBoundary caught an error:', error, errorInfo);
    }
  }

  override componentDidUpdate(prevProps: ErrorBoundaryProps): void {
    // Reset error state when resetKeys change
    const { resetKeys } = this.props;
    if (
      resetKeys &&
      prevProps.resetKeys &&
      !resetKeys.every((key, index) => key === prevProps.resetKeys?.[index])
    ) {
      this.reset();
    }
  }

  reset = (): void => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    });
  };

  override render(): React.ReactNode {
    const { hasError, error, errorInfo } = this.state;
    const { children, fallback } = this.props;

    if (hasError) {
      if (fallback) {
        return fallback;
      }

      return <DefaultErrorFallback error={error} errorInfo={errorInfo} onReset={this.reset} />;
    }

    return children;
  }
}

/**
 * Default Error Fallback UI
 */
interface DefaultErrorFallbackProps {
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
  onReset: () => void;
}

function DefaultErrorFallback({ error, errorInfo, onReset }: DefaultErrorFallbackProps) {
  const isDevelopment = import.meta.env.DEV;

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="w-full max-w-2xl"
      >
        <Card className="border-destructive/50">
          <CardHeader className="text-center space-y-4">
            <div className="mx-auto rounded-full bg-destructive/10 p-4 w-fit">
              <AlertTriangle className="h-12 w-12 text-destructive" aria-hidden="true" />
            </div>
            <CardTitle className="text-2xl">Something went wrong</CardTitle>
            <p className="text-muted-foreground">
              We encountered an unexpected error. You can try reloading the page or go back home.
            </p>
          </CardHeader>

          <CardContent className="space-y-4">
            {/* Error message */}
            {error && (
              <div className="rounded-lg bg-destructive/10 p-4 border border-destructive/20">
                <p className="text-sm font-medium text-destructive">
                  {error.message || 'Unknown error'}
                </p>
              </div>
            )}

            {/* Error details (development only) */}
            {isDevelopment && errorInfo && (
              <details className="rounded-lg bg-muted p-4 border">
                <summary className="text-sm font-medium cursor-pointer hover:text-foreground transition-colors">
                  Error Details (Development Only)
                </summary>
                <pre className="mt-3 text-xs overflow-auto max-h-60 text-muted-foreground font-mono">
                  {error?.stack}
                  {'\n\n'}
                  {errorInfo.componentStack}
                </pre>
              </details>
            )}

            {/* Actions */}
            <div className="flex flex-wrap gap-3 justify-center pt-2">
              <Button onClick={onReset} variant="default" className="gap-2">
                <RefreshCw className="h-4 w-4" />
                Try Again
              </Button>
              <Button
                onClick={() => (window.location.href = '/')}
                variant="outline"
                className="gap-2"
              >
                <Home className="h-4 w-4" />
                Go Home
              </Button>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}

/**
 * Hook to reset error boundary from child components
 */
export function useErrorBoundary() {
  const [error, setError] = React.useState<Error | null>(null);

  React.useEffect(() => {
    if (error) {
      throw error;
    }
  }, [error]);

  const reset = React.useCallback(() => {
    setError(null);
  }, []);

  const showBoundary = React.useCallback((error: Error) => {
    setError(error);
  }, []);

  return { reset, showBoundary };
}

/**
 * Async Error Boundary - Catches async errors and query errors
 */
interface AsyncErrorBoundaryProps {
  children: React.ReactNode;
  onError?: (error: Error) => void;
  resetKeys?: unknown[];
}

export function AsyncErrorBoundary({ children, onError, resetKeys }: AsyncErrorBoundaryProps) {
  const [error, setError] = React.useState<Error | null>(null);

  // Reset when resetKeys change
  React.useEffect(() => {
    setError(null);
  }, [resetKeys]);

  // Handle async errors
  React.useEffect(() => {
    const handleError = (event: PromiseRejectionEvent) => {
      const error = event.reason as Error;
      setError(error);
      onError?.(error);
      event.preventDefault();
    };

    window.addEventListener('unhandledrejection', handleError);
    return () => window.removeEventListener('unhandledrejection', handleError);
  }, [onError]);

  if (error) {
    return <DefaultErrorFallback error={error} errorInfo={null} onReset={() => setError(null)} />;
  }

  return <>{children}</>;
}
