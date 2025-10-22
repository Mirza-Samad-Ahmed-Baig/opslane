import { Toaster as SonnerToaster } from 'sonner';
import { useEffect, useState } from 'react';

/**
 * Toaster - Toast notification provider using Sonner
 *
 * Features:
 * - Automatic theme detection (light/dark)
 * - Consistent with design system colors
 * - 200ms animations (Calm Technology)
 * - Accessible with ARIA live regions
 * - Position: bottom-right (non-intrusive)
 * - Max 3 toasts visible at once
 *
 * Usage:
 * 1. Add <Toaster /> to your app root (already done in App.tsx)
 * 2. Import toast function anywhere:
 *
 * ```tsx
 * import { toast } from 'sonner';
 *
 * // Success toast
 * toast.success('File uploaded successfully');
 *
 * // Error toast
 * toast.error('Failed to save changes');
 *
 * // Info toast
 * toast.info('New update available');
 *
 * // Warning toast
 * toast.warning('Unsaved changes detected');
 *
 * // Loading toast (dismisses automatically)
 * const id = toast.loading('Uploading...');
 * // Later: toast.success('Uploaded!', { id });
 *
 * // Custom duration
 * toast.success('Quick message', { duration: 2000 });
 *
 * // With action button
 * toast.error('Connection lost', {
 *   action: {
 *     label: 'Retry',
 *     onClick: () => reconnect(),
 *   },
 * });
 * ```
 */
export function Toaster() {
  const [theme, setTheme] = useState<'light' | 'dark'>('light');

  useEffect(() => {
    // Detect initial theme
    const isDark = document.documentElement.classList.contains('dark');
    setTheme(isDark ? 'dark' : 'light');

    // Watch for theme changes
    const observer = new MutationObserver(() => {
      const isDark = document.documentElement.classList.contains('dark');
      setTheme(isDark ? 'dark' : 'light');
    });

    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    });

    return () => observer.disconnect();
  }, []);

  return (
    <SonnerToaster
      theme={theme}
      position="bottom-right"
      expand={false}
      visibleToasts={3}
      duration={4000}
      closeButton
      richColors
      toastOptions={{
        style: {
          borderRadius: '0.75rem',
        },
        className: 'transition-all duration-200',
      }}
    />
  );
}
