import { useQuery, useQueryClient } from '@tanstack/react-query';
import { invoke } from '@tauri-apps/api/core';
import { useEffect } from 'react';

export interface FileChange {
  path: string;
  status: 'added' | 'modified' | 'deleted';
  additions: number;
  deletions: number;
  diff: string;
}

/**
 * Hook to fetch file changes for a session
 * Polls every 5 seconds to detect new changes (reduced from 3s for better performance)
 * Only refetches when window is focused to reduce unnecessary work
 *
 * Cache Isolation:
 * This hook is part of a two-pronged defense-in-depth approach to prevent cross-session cache contamination:
 * 1. Hook-level invalidation (here): Invalidate previous session's cache when sessionId changes
 * 2. Component-level cleanup (SessionDetailPage): Remove queries completely on unmount
 */
export function useSessionChanges(sessionId: string) {
  const queryClient = useQueryClient();

  // Invalidate previous session's cache when sessionId changes to prevent stale data contamination
  useEffect(() => {
    // Capture the current sessionId in closure
    const currentSessionId = sessionId;
    return () => {
      // When sessionId changes or component unmounts, invalidate the captured (now previous) sessionId
      // This ensures stale data from the old session doesn't briefly appear in the new session
      queryClient.invalidateQueries({ queryKey: ['changes', currentSessionId] });
    };
  }, [sessionId, queryClient]);

  return useQuery({
    queryKey: ['changes', sessionId],
    queryFn: () => invoke<FileChange[]>('get_session_changes', { sessionId }),
    enabled: !!sessionId,
    refetchInterval: 5000, // Poll every 5 seconds (increased from 3s)
    refetchOnWindowFocus: true, // Refetch when window gains focus
    staleTime: 2000, // Consider data fresh for 2 seconds
  });
}
