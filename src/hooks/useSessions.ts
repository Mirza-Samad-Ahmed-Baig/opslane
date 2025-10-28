import { useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
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
 * Event payload for session events
 */
interface SessionEvent {
  session_id: string;
  timestamp: string;
}

interface SessionStatusEvent extends SessionEvent {
  status: string;
}

/**
 * Query hook for fetching all sessions
 *
 * Phase 3: Event-driven updates instead of polling
 * Listens to session-status-changed, session-created, and session-deleted events
 */
export function useSessions() {
  const queryClient = useQueryClient();

  // Listen for session events
  useEffect(() => {
    const unlisteners: UnlistenFn[] = [];

    const setupListeners = async () => {
      // Listen for status changes
      const statusUnlisten = await listen<SessionStatusEvent>('session-status-changed', (event) => {
        logger.info('Session status changed', {
          sessionId: event.payload.session_id,
          status: event.payload.status,
        });
        queryClient.invalidateQueries({ queryKey: ['sessions'] });
      });
      unlisteners.push(statusUnlisten);

      // Listen for new sessions
      const createdUnlisten = await listen<SessionEvent>('session-created', (event) => {
        logger.info('Session created', { sessionId: event.payload.session_id });
        queryClient.invalidateQueries({ queryKey: ['sessions'] });
      });
      unlisteners.push(createdUnlisten);

      // Listen for deleted sessions
      const deletedUnlisten = await listen<SessionEvent>('session-deleted', (event) => {
        logger.info('Session deleted', { sessionId: event.payload.session_id });
        queryClient.invalidateQueries({ queryKey: ['sessions'] });
      });
      unlisteners.push(deletedUnlisten);

      // Listen for session name updates (AI title generation)
      const nameUpdatedUnlisten = await listen<{ session_id: string; name: string }>(
        'session-name-updated',
        (event) => {
          logger.info('Session name updated', {
            sessionId: event.payload.session_id,
            name: event.payload.name,
          });
          // Invalidate queries to refresh session list
          queryClient.invalidateQueries({ queryKey: ['sessions'] });
          queryClient.invalidateQueries({ queryKey: ['session', event.payload.session_id] });
        }
      );
      unlisteners.push(nameUpdatedUnlisten);

      // Listen for archived sessions
      const archivedUnlisten = await listen<SessionEvent>('session-archived', (event) => {
        logger.info('Session archived', { sessionId: event.payload.session_id });
        queryClient.invalidateQueries({ queryKey: ['sessions'] });
      });
      unlisteners.push(archivedUnlisten);

      // Listen for unarchived sessions
      const unarchivedUnlisten = await listen<SessionEvent>('session-unarchived', (event) => {
        logger.info('Session unarchived', { sessionId: event.payload.session_id });
        queryClient.invalidateQueries({ queryKey: ['sessions'] });
      });
      unlisteners.push(unarchivedUnlisten);
    };

    setupListeners();

    return () => {
      unlisteners.forEach((unlisten) => unlisten());
    };
  }, [queryClient]);

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
    // Phase 3: No polling - updates driven by events
  });
}

/**
 * Mutation hook for creating a new session
 * Now requires project_id in the NewSession payload
 */
export function useCreateSession() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: { projectId: string; newSession: NewSession }) => {
      logger.debug('[useCreateSession] Creating session', params);

      const session = await invoke<Session>('create_session', {
        projectId: params.projectId,
        newSession: params.newSession,
      });

      logger.debug('[useCreateSession] Session created', { session });
      return session;
    },
    onSuccess: (session) => {
      // Invalidate sessions list to refresh UI
      queryClient.invalidateQueries({ queryKey: ['sessions'] });
      queryClient.invalidateQueries({ queryKey: ['sessions', session.project_id] });

      // Add to cache optimistically
      queryClient.setQueryData(['session', session.id], session);

      toast.success(`Session "${session.name}" created successfully`);
    },
    onError: (error: Error) => {
      logger.error('[useCreateSession] Failed to create session', error);
      const message = formatErrorMessage(error);
      toast.error(`Failed to create session: ${message}`);
    },
  });
}

/**
 * Get sessions for a specific project
 */
export function useSessionsByProject(projectId: string | undefined) {
  return useQuery({
    queryKey: ['sessions', projectId],
    queryFn: async () => {
      if (!projectId) {
        throw new Error('Project ID is required');
      }
      logger.debug('[useSessionsByProject] Fetching sessions', { projectId });
      const sessions = await invoke<Session[]>('list_sessions_by_project', {
        projectId,
      });
      return sessions;
    },
    enabled: !!projectId,
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

/**
 * Mutation hook for archiving a session
 * Stops sync if active, stops container, marks as archived
 */
export function useArchiveSession() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (sessionId: string) => {
      logger.debug('Archiving session', { sessionId });
      try {
        await invoke<void>('archive_session', { sessionId });
        logger.info('Session archived successfully', { sessionId });
      } catch (error) {
        logger.error('Failed to archive session', error as Error);
        throw error;
      }
    },
    onSuccess: (_, sessionId) => {
      // Invalidate and refetch to remove archived session from list
      queryClient.invalidateQueries({ queryKey: ['sessions'] });
      logger.info('Session archived from UI', { sessionId });
      toast.success('Session archived successfully');
    },
    onError: (error: Error) => {
      const message = formatErrorMessage(error);
      toast.error(`Failed to archive session: ${message}`);
    },
  });
}

/**
 * Mutation hook for unarchiving a session
 * Marks as unarchived, restarts container
 */
export function useUnarchiveSession() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (sessionId: string) => {
      logger.debug('Unarchiving session', { sessionId });
      try {
        await invoke<void>('unarchive_session', { sessionId });
        logger.info('Session unarchived successfully', { sessionId });
      } catch (error) {
        logger.error('Failed to unarchive session', error as Error);
        throw error;
      }
    },
    onSuccess: (_, sessionId) => {
      // Invalidate and refetch to show unarchived session in list
      queryClient.invalidateQueries({ queryKey: ['sessions'] });
      logger.info('Session unarchived from UI', { sessionId });
      toast.success('Session unarchived successfully');
    },
    onError: (error: Error) => {
      const message = formatErrorMessage(error);
      toast.error(`Failed to unarchive session: ${message}`);
    },
  });
}
