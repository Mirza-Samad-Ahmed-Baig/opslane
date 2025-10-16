import { useQuery } from '@tanstack/react-query';
import { invoke } from '@tauri-apps/api/core';
import type { Session } from '@/types';
import { logger } from '@/utils/logger';

/**
 * Hook to fetch a single session by ID
 * Used in the session detail page
 */
export function useSession(sessionId: string) {
  return useQuery({
    queryKey: ['session', sessionId],
    queryFn: async () => {
      logger.debug('Fetching session', { sessionId });
      try {
        const session = await invoke<Session>('get_session', { sessionId });
        logger.info('Session fetched', { sessionId, name: session.name });
        return session;
      } catch (error) {
        logger.error('Failed to fetch session', error as Error);
        throw error;
      }
    },
    enabled: !!sessionId,
  });
}
