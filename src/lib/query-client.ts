import { QueryClient } from '@tanstack/react-query';

/**
 * Global React Query client with optimized defaults
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Don't refetch on window focus (reduces unnecessary API calls)
      refetchOnWindowFocus: false,
      // Retry failed queries once (not too aggressive)
      retry: 1,
      // Consider data stale after 5 seconds (matches our polling interval)
      staleTime: 5000,
    },
    mutations: {
      // Retry failed mutations once
      retry: 1,
    },
  },
});
