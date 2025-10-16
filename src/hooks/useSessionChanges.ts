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
 * Polls every 3 seconds to detect new changes
 */
export function useSessionChanges(sessionId: string) {
  return useQuery({
    queryKey: ['changes', sessionId],
    queryFn: () => invoke<FileChange[]>('get_session_changes', { sessionId }),
    enabled: !!sessionId,
    refetchInterval: 3000, // Poll every 3 seconds
  });
}
