import { useQueryClient, useMutation } from '@tanstack/react-query';
import { toastPatterns } from './toast-patterns';

/**
 * Optimistic Updates - Patterns for instant UI feedback with error recovery
 *
 * Philosophy:
 * 1. Update UI immediately for perceived speed
 * 2. Roll back on error with clear feedback
 * 3. Show loading state for operations > 300ms
 * 4. Provide retry mechanisms
 *
 * Benefits:
 * - Instant feedback (feels faster)
 * - Better UX during network delays
 * - Graceful error handling
 * - Maintains data consistency
 */

/**
 * Creates an optimistic mutation with automatic rollback on error
 *
 * @example
 * ```tsx
 * const updateSession = useOptimisticMutation({
 *   mutationFn: async (updates) => {
 *     return api.updateSession(sessionId, updates);
 *   },
 *   queryKey: ['session', sessionId],
 *   optimisticUpdate: (oldData, variables) => ({
 *     ...oldData,
 *     ...variables,
 *   }),
 *   successMessage: 'Session updated',
 *   errorMessage: 'Failed to update session',
 * });
 * ```
 */
export function useOptimisticMutation<TData, TVariables, TContext = unknown>({
  mutationFn,
  queryKey,
  optimisticUpdate,
  successMessage,
  errorMessage,
  onSuccess,
  onError,
  showToast = true,
}: {
  mutationFn: (variables: TVariables) => Promise<TData>;
  queryKey: unknown[];
  optimisticUpdate?: (oldData: TData | undefined, variables: TVariables) => TData;
  successMessage?: string;
  errorMessage?: string;
  onSuccess?: (data: TData, variables: TVariables, context: TContext | undefined) => void;
  onError?: (error: Error, variables: TVariables, context: TContext | undefined) => void;
  showToast?: boolean;
}) {
  const queryClient = useQueryClient();

  return useMutation<TData, Error, TVariables, TContext>({
    mutationFn,

    // Optimistic update: immediately update cache before mutation
    onMutate: async (variables) => {
      // Cancel outgoing refetches (so they don't overwrite our optimistic update)
      await queryClient.cancelQueries({ queryKey });

      // Snapshot previous value
      const previousData = queryClient.getQueryData<TData>(queryKey);

      // Optimistically update cache if function provided
      if (optimisticUpdate && previousData !== undefined) {
        const newData = optimisticUpdate(previousData, variables);
        queryClient.setQueryData(queryKey, newData);
      }

      // Return context with snapshot for rollback
      return { previousData } as TContext;
    },

    // On success: invalidate to ensure fresh data
    onSuccess: (data, variables, context) => {
      if (showToast && successMessage) {
        toastPatterns.success(successMessage);
      }
      queryClient.invalidateQueries({ queryKey });
      onSuccess?.(data, variables, context);
    },

    // On error: rollback to snapshot and show error
    onError: (error, variables, context) => {
      const ctx = context as { previousData?: TData } | undefined;

      // Rollback to previous data
      if (ctx?.previousData !== undefined) {
        queryClient.setQueryData(queryKey, ctx.previousData);
      }

      if (showToast) {
        if (errorMessage) {
          toastPatterns.error(`${errorMessage}: ${error.message}`);
        } else {
          toastPatterns.error(error.message);
        }
      }

      onError?.(error, variables, context);
    },
  });
}

/**
 * Creates a mutation with loading toast and automatic state updates
 *
 * @example
 * ```tsx
 * const uploadFile = useLoadingMutation({
 *   mutationFn: async (file) => api.upload(file),
 *   loadingMessage: (file) => `Uploading ${file.name}...`,
 *   successMessage: (data, file) => `${file.name} uploaded`,
 *   errorMessage: (error, file) => `Failed to upload ${file.name}`,
 * });
 * ```
 */
export function useLoadingMutation<TData, TVariables>({
  mutationFn,
  loadingMessage,
  successMessage,
  errorMessage,
  onSuccess,
  onError,
}: {
  mutationFn: (variables: TVariables) => Promise<TData>;
  loadingMessage: string | ((variables: TVariables) => string);
  successMessage?: string | ((data: TData, variables: TVariables) => string);
  errorMessage?: string | ((error: Error, variables: TVariables) => string);
  onSuccess?: (data: TData, variables: TVariables) => void;
  onError?: (error: Error, variables: TVariables) => void;
}) {
  return useMutation<TData, Error, TVariables, { toastId: string | number }>({
    mutationFn,

    onMutate: (variables) => {
      const message =
        typeof loadingMessage === 'function' ? loadingMessage(variables) : loadingMessage;
      const toastId = toastPatterns.loading(message);
      return { toastId };
    },

    onSuccess: (data, variables, context) => {
      const message =
        typeof successMessage === 'function'
          ? successMessage(data, variables)
          : successMessage || 'Success';

      toastPatterns.updateSuccess(context.toastId, message);
      onSuccess?.(data, variables);
    },

    onError: (error, variables, context) => {
      const message =
        typeof errorMessage === 'function'
          ? errorMessage(error, variables)
          : errorMessage || error.message;

      if (context) {
        toastPatterns.updateError(context.toastId, message);
      } else {
        toastPatterns.error(message);
      }

      onError?.(error, variables);
    },
  });
}

/**
 * Creates a mutation with retry functionality
 *
 * @example
 * ```tsx
 * const sendMessage = useRetryableMutation({
 *   mutationFn: async (message) => api.sendMessage(message),
 *   maxRetries: 3,
 *   retryDelay: 1000,
 *   errorMessage: 'Failed to send message',
 * });
 * ```
 */
export function useRetryableMutation<TData, TVariables>({
  mutationFn,
  maxRetries = 3,
  retryDelay = 1000,
  successMessage,
  errorMessage,
  onSuccess,
  onError,
}: {
  mutationFn: (variables: TVariables) => Promise<TData>;
  maxRetries?: number;
  retryDelay?: number;
  successMessage?: string;
  errorMessage?: string;
  onSuccess?: (data: TData) => void;
  onError?: (error: Error) => void;
}) {
  const mutation = useMutation<TData, Error, TVariables>({
    mutationFn,
    retry: maxRetries,
    retryDelay,

    onSuccess: (data) => {
      if (successMessage) {
        toastPatterns.success(successMessage);
      }
      onSuccess?.(data);
    },

    onError: (error) => {
      if (errorMessage) {
        toastPatterns.error(`${errorMessage}: ${error.message}`);
      } else {
        toastPatterns.error(error.message);
      }
      onError?.(error);
    },
  });

  return {
    ...mutation,
    mutateWithRetry: (variables: TVariables) => {
      const attemptMutation = async (attempt: number = 1): Promise<void> => {
        try {
          await mutation.mutateAsync(variables);
        } catch (error) {
          if (attempt < maxRetries) {
            toastPatterns.warning(`Retry ${attempt}/${maxRetries}...`);
            await new Promise((resolve) => setTimeout(resolve, retryDelay));
            await attemptMutation(attempt + 1);
          } else {
            throw error;
          }
        }
      };

      return attemptMutation();
    },
  };
}

/**
 * Batch mutations with progress tracking
 *
 * @example
 * ```tsx
 * const { executeBatch, progress } = useBatchMutation();
 *
 * await executeBatch({
 *   items: files,
 *   mutationFn: (file) => uploadFile(file),
 *   onItemSuccess: (file) => console.log(`Uploaded ${file.name}`),
 *   onItemError: (file, error) => console.error(`Failed ${file.name}`, error),
 *   successMessage: 'All files uploaded',
 * });
 * ```
 */
export function useBatchMutation<TItem, TResult>() {
  const [progress, setProgress] = React.useState({
    total: 0,
    completed: 0,
    failed: 0,
    inProgress: false,
  });

  const executeBatch = async ({
    items,
    mutationFn,
    onItemSuccess,
    onItemError,
    successMessage,
    errorMessage,
    concurrency = 3,
  }: {
    items: TItem[];
    mutationFn: (item: TItem) => Promise<TResult>;
    onItemSuccess?: (item: TItem, result: TResult) => void;
    onItemError?: (item: TItem, error: Error) => void;
    successMessage?: string;
    errorMessage?: string;
    concurrency?: number;
  }) => {
    const total = items.length;
    let completed = 0;
    let failed = 0;

    setProgress({ total, completed: 0, failed: 0, inProgress: true });

    const toastId = toastPatterns.loading(`Processing 0/${total} items...`);

    // Process in batches with concurrency limit
    const processBatch = async (batch: TItem[]) => {
      const results = await Promise.allSettled(batch.map((item) => mutationFn(item)));

      results.forEach((result, index) => {
        const item = batch[index];
        if (!item) return; // Safety check for undefined items

        if (result.status === 'fulfilled') {
          completed++;
          onItemSuccess?.(item, result.value);
        } else {
          failed++;
          onItemError?.(item, result.reason);
        }
      });

      setProgress({ total, completed, failed, inProgress: true });
      toast.loading(`Processing ${completed + failed}/${total} items...`, { id: toastId });
    };

    // Split into batches
    for (let i = 0; i < items.length; i += concurrency) {
      const batch = items.slice(i, i + concurrency);
      await processBatch(batch);
    }

    setProgress({ total, completed, failed, inProgress: false });

    // Final toast
    if (failed === 0) {
      toastPatterns.updateSuccess(
        toastId,
        successMessage || `Successfully processed ${completed} items`
      );
    } else if (completed === 0) {
      toastPatterns.updateError(toastId, errorMessage || `Failed to process ${failed} items`);
    } else {
      toast.warning(`Processed ${completed} items, ${failed} failed`, { id: toastId });
    }
  };

  return { executeBatch, progress };
}

// Re-export React for the batch mutation hook
import * as React from 'react';
import { toast } from 'sonner';
