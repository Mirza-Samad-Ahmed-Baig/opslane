import { useQuery } from '@tanstack/react-query';
import { invoke } from '@tauri-apps/api/core';
import type { Session } from '@/types';
import { logger } from '@/utils/logger';

/**
 * Hook to fetch a single session by ID
 * Used in the session detail page
 *
 * Polls every second while session is in transitional states (created, cloning)
 * to update the UI when status changes to ready
 */
export function useSession(sessionId: string) {
  return useQuery({
    queryKey: ['session', sessionId],
    queryFn: async () => {
      logger.debug('Fetching session', { sessionId });
      try {
        const session = await invoke<Session>('get_session', { sessionId });
        logger.info('Session fetched', { sessionId, name: session.name, status: session.status });
        return session;
      } catch (error) {
        logger.error('Failed to fetch session', error as Error);
        throw error;
      }
    },
    enabled: !!sessionId,
    // Poll frequently while session is being set up, stop when ready or errored
    refetchInterval: (query) => {
      const session = query.state.data;
      if (!session) return false;

      // Poll every 1 second if session is in transitional state
      if (session.status === 'created' || session.status === 'cloning') {
        return 1000;
      }

      // Stop polling once session is ready or errored
      return false;
    },
  });
}
