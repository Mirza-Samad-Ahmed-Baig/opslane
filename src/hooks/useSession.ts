import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import type { Session } from '@/types';
import { logger } from '@/utils/logger';

/**
 * Event payload for session status changes
 */
interface SessionStatusEvent {
  session_id: string;
  status: string;
  timestamp: string;
}

/**
 * Hook to fetch a single session by ID
 * Used in the session detail page
 *
 * Phase 3: Event-driven updates instead of polling
 * Listens to "session-status-changed" events from backend
 */
export function useSession(sessionId: string) {
  const queryClient = useQueryClient();

  // Listen for status change events
  useEffect(() => {
    if (!sessionId) return;

    let unlisten: UnlistenFn | undefined;

    const setupListener = async () => {
      unlisten = await listen<SessionStatusEvent>('session-status-changed', (event) => {
        if (event.payload.session_id === sessionId) {
          logger.info('Session status changed', {
            sessionId,
            status: event.payload.status,
          });

          // Invalidate query to trigger refetch
          queryClient.invalidateQueries({
            queryKey: ['session', sessionId],
          });
        }
      });
    };

    setupListener();

    return () => {
      if (unlisten) unlisten();
    };
  }, [sessionId, queryClient]);

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
    // Phase 3: No polling - updates driven by events
  });
}
