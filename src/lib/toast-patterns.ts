import { toast } from 'sonner';

/**
 * Toast Patterns - Reusable notification patterns following UX best practices
 *
 * All toast functions return a toast ID that can be used to update or dismiss the toast.
 *
 * Design Philosophy:
 * - Success: Confirm completion of user actions
 * - Error: Clear error messages with actionable next steps
 * - Info: Non-critical updates and information
 * - Warning: Caution about potential issues
 * - Loading: Show progress for async operations
 *
 * Usage:
 * ```tsx
 * import { toastPatterns } from '@/lib/toast-patterns';
 *
 * // Simple success
 * toastPatterns.success('Changes saved');
 *
 * // Error with retry action
 * toastPatterns.errorWithRetry('Failed to upload', () => retryUpload());
 *
 * // Loading operation
 * const id = toastPatterns.loading('Uploading file...');
 * // Later: toastPatterns.updateSuccess(id, 'File uploaded');
 * ```
 */

export const toastPatterns = {
  // ============================================================================
  // SUCCESS PATTERNS
  // ============================================================================

  /**
   * Standard success message
   * Use for: Confirming successful operations
   */
  success: (message: string) => {
    return toast.success(message, {
      duration: 3000,
    });
  },

  /**
   * Success with description
   * Use for: Operations that need additional context
   */
  successWithDescription: (title: string, description: string) => {
    return toast.success(title, {
      description,
      duration: 4000,
    });
  },

  /**
   * Success with action button
   * Use for: When user might want to act on the result
   */
  successWithAction: (message: string, actionLabel: string, onAction: () => void) => {
    return toast.success(message, {
      duration: 5000,
      action: {
        label: actionLabel,
        onClick: onAction,
      },
    });
  },

  // ============================================================================
  // ERROR PATTERNS
  // ============================================================================

  /**
   * Standard error message
   * Use for: Simple error notifications
   */
  error: (message: string) => {
    return toast.error(message, {
      duration: 5000, // Longer duration for errors
    });
  },

  /**
   * Error with description
   * Use for: Errors that need more context
   */
  errorWithDescription: (title: string, description: string) => {
    return toast.error(title, {
      description,
      duration: 6000,
    });
  },

  /**
   * Error with retry action
   * Use for: Recoverable errors
   */
  errorWithRetry: (message: string, onRetry: () => void) => {
    return toast.error(message, {
      duration: 8000,
      action: {
        label: 'Retry',
        onClick: onRetry,
      },
    });
  },

  /**
   * Critical error (stays until dismissed)
   * Use for: Errors requiring user attention
   */
  criticalError: (title: string, description: string) => {
    return toast.error(title, {
      description,
      duration: Infinity, // Stays until user dismisses
    });
  },

  // ============================================================================
  // INFO PATTERNS
  // ============================================================================

  /**
   * Standard info message
   * Use for: General information updates
   */
  info: (message: string) => {
    return toast.info(message, {
      duration: 4000,
    });
  },

  /**
   * Info with action
   * Use for: Updates that user might want to act on
   */
  infoWithAction: (message: string, actionLabel: string, onAction: () => void) => {
    return toast.info(message, {
      duration: 6000,
      action: {
        label: actionLabel,
        onClick: onAction,
      },
    });
  },

  // ============================================================================
  // WARNING PATTERNS
  // ============================================================================

  /**
   * Standard warning
   * Use for: Potential issues or cautions
   */
  warning: (message: string) => {
    return toast.warning(message, {
      duration: 5000,
    });
  },

  /**
   * Warning with action
   * Use for: Warnings that require user decision
   */
  warningWithAction: (message: string, actionLabel: string, onAction: () => void) => {
    return toast.warning(message, {
      duration: 8000,
      action: {
        label: actionLabel,
        onClick: onAction,
      },
    });
  },

  // ============================================================================
  // LOADING PATTERNS
  // ============================================================================

  /**
   * Loading state
   * Use for: Long-running operations
   * Returns ID to update later
   */
  loading: (message: string) => {
    return toast.loading(message);
  },

  /**
   * Update loading to success
   * Use after successful completion of loading operation
   */
  updateSuccess: (id: string | number, message: string) => {
    toast.success(message, { id });
  },

  /**
   * Update loading to error
   * Use after failed completion of loading operation
   */
  updateError: (id: string | number, message: string) => {
    toast.error(message, { id });
  },

  /**
   * Dismiss a toast by ID
   */
  dismiss: (id: string | number) => {
    toast.dismiss(id);
  },

  /**
   * Dismiss all toasts
   */
  dismissAll: () => {
    toast.dismiss();
  },

  // ============================================================================
  // PROMISE PATTERNS
  // ============================================================================

  /**
   * Automatically handle promise states
   * Shows loading, then success or error based on promise result
   *
   * @example
   * ```tsx
   * toastPatterns.promise(
   *   uploadFile(),
   *   {
   *     loading: 'Uploading file...',
   *     success: 'File uploaded successfully',
   *     error: 'Failed to upload file',
   *   }
   * );
   * ```
   */
  promise: <T>(
    promise: Promise<T>,
    messages: {
      loading: string;
      success: string;
      error: string;
    }
  ) => {
    return toast.promise(promise, messages);
  },
};

/**
 * Common application-specific toast patterns
 */
export const appToasts = {
  // Session operations
  sessionCreated: (sessionName: string) => {
    toastPatterns.success(`Session "${sessionName}" created`);
  },

  sessionDeleted: (sessionName: string) => {
    toastPatterns.success(`Session "${sessionName}" deleted`);
  },

  sessionError: (error: string) => {
    toastPatterns.error(`Session error: ${error}`);
  },

  // File operations
  fileSaved: (filename: string) => {
    toastPatterns.success(`${filename} saved`);
  },

  fileUploadStart: (filename: string) => {
    return toastPatterns.loading(`Uploading ${filename}...`);
  },

  fileUploadComplete: (id: string | number, filename: string) => {
    toastPatterns.updateSuccess(id, `${filename} uploaded`);
  },

  fileUploadError: (id: string | number, filename: string, error: string) => {
    toastPatterns.updateError(id, `Failed to upload ${filename}: ${error}`);
  },

  // Connection operations
  connectionLost: (onRetry: () => void) => {
    toastPatterns.errorWithRetry('Connection lost', onRetry);
  },

  connectionRestored: () => {
    toastPatterns.success('Connection restored');
  },

  // Generic operations
  operationInProgress: (operation: string) => {
    return toastPatterns.loading(`${operation}...`);
  },

  operationComplete: (id: string | number, operation: string) => {
    toastPatterns.updateSuccess(id, `${operation} complete`);
  },

  operationFailed: (id: string | number, operation: string, onRetry?: () => void) => {
    if (onRetry) {
      toast.error(`${operation} failed`, {
        id,
        action: {
          label: 'Retry',
          onClick: onRetry,
        },
      });
    } else {
      toastPatterns.updateError(id, `${operation} failed`);
    }
  },

  // Copy operations
  copiedToClipboard: (what: string = 'Text') => {
    toastPatterns.success(`${what} copied to clipboard`);
  },

  // Unsaved changes
  unsavedChanges: (onSave: () => void, onDiscard: () => void) => {
    toast.warning('You have unsaved changes', {
      duration: Infinity,
      action: {
        label: 'Save',
        onClick: onSave,
      },
      cancel: {
        label: 'Discard',
        onClick: onDiscard,
      },
    });
  },
};
