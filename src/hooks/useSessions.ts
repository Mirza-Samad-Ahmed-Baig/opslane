import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { invoke } from '@tauri-apps/api/core';
import { toast } from 'sonner';
import type { Session, NewSession } from '@/types';
import { logger } from '@/utils/logger';

/**
 * Transform backend errors into user-friendly messages
 */
function formatErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    // Transform common backend errors into user-friendly messages
    if (error.message.includes('Docker')) {
      return 'Docker is not running. Please start Docker Desktop.';
    }
    if (error.message.includes('not found')) {
      return 'Repository path not found. Please check the path.';
    }
    if (error.message.includes('already exists')) {
      return 'A session with this name already exists.';
    }
    if (error.message.includes('permission')) {
      return 'Permission denied. Check folder permissions.';
    }
    return error.message;
  }
  return 'An unexpected error occurred';
}

/**
 * Query hook for fetching all sessions
 * Auto-refreshes every 5 seconds to catch status updates
 */
export function useSessions() {
  return useQuery({
    queryKey: ['sessions'],
    queryFn: async () => {
      logger.debug('Fetching sessions list');
      try {
        const sessions = await invoke<Session[]>('list_sessions');
        // logger.info('Sessions fetched successfully', { count: sessions.length });
        return sessions;
      } catch (error) {
        logger.error('Failed to fetch sessions', error as Error);
        throw error;
      }
    },
    // Poll every 5 seconds for status updates (created → ready)
    refetchInterval: 5000,
  });
}

/**
 * Mutation hook for creating a new session
 * Invalidates sessions query on success to trigger refetch
 */
export function useCreateSession() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (newSession: NewSession) => {
      logger.debug('Creating session', { name: newSession.name });
      try {
        const session = await invoke<Session>('create_session', { newSession });
        logger.info('Session created successfully', { id: session.id, name: session.name });
        return session;
      } catch (error) {
        logger.error('Failed to create session', error as Error);
        throw error;
      }
    },
    onSuccess: (session) => {
      // Invalidate and refetch sessions to show new session
      queryClient.invalidateQueries({ queryKey: ['sessions'] });
      toast.success(`Session "${session.name}" created successfully`);
    },
    onError: (error: Error) => {
      const message = formatErrorMessage(error);
      toast.error(`Failed to create session: ${message}`);
    },
  });
}

/**
 * Mutation hook for deleting a session
 * Invalidates sessions query on success to remove from list
 */
export function useDeleteSession() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (sessionId: string) => {
      logger.debug('Deleting session', { sessionId });
      try {
        await invoke<void>('delete_session', { sessionId });
        logger.info('Session deleted successfully', { sessionId });
      } catch (error) {
        logger.error('Failed to delete session', error as Error);
        throw error;
      }
    },
    onSuccess: (_, sessionId) => {
      // Invalidate and refetch to remove deleted session from list
      queryClient.invalidateQueries({ queryKey: ['sessions'] });
      logger.info('Session deleted from UI', { sessionId });
      toast.success('Session deleted successfully');
    },
    onError: (error: Error) => {
      const message = formatErrorMessage(error);
      toast.error(`Failed to delete session: ${message}`);
    },
  });
}
