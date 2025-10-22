import { useQuery } from '@tanstack/react-query';
import { invoke } from '@tauri-apps/api/core';

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
 */
export function useSessionChanges(sessionId: string) {
  return useQuery({
    queryKey: ['changes', sessionId],
    queryFn: () => invoke<FileChange[]>('get_session_changes', { sessionId }),
    enabled: !!sessionId,
    refetchInterval: 5000, // Poll every 5 seconds (increased from 3s)
    refetchOnWindowFocus: true, // Refetch when window gains focus
    staleTime: 2000, // Consider data fresh for 2 seconds
  });
}
