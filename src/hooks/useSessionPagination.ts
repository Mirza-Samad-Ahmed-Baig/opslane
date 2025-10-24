import { useMemo, useState, useCallback } from 'react';
import type { Session } from '@/types/session';

interface UseSessionPaginationOptions {
  sessions: Session[];
  initialCount?: number;
  loadMoreCount?: number;
}

interface UseSessionPaginationReturn {
  visibleSessions: Session[];
  hasMoreSessions: boolean;
  isShowingAll: boolean;
  hiddenCount: number;
  loadMoreSessions: () => void;
  loadAllSessions: () => void;
  resetPagination: () => void;
}

/**
 * Hook to manage pagination for sessions within a project group.
 * Shows the LAST N sessions (most recent) with "load more" functionality.
 */
export function useSessionPagination({
  sessions,
  initialCount = 5,
  loadMoreCount = 10,
}: UseSessionPaginationOptions): UseSessionPaginationReturn {
  const [visibleCount, setVisibleCount] = useState(initialCount);

  const visibleSessions = useMemo(() => {
    // Sessions are already sorted by created_at DESC from backend
    // Show the first N (which are the most recent)
    return sessions.slice(0, visibleCount);
  }, [sessions, visibleCount]);

  const hasMoreSessions = sessions.length > visibleCount;
  const isShowingAll = visibleCount >= sessions.length;
  const hiddenCount = Math.max(0, sessions.length - visibleCount);

  const loadMoreSessions = useCallback(() => {
    setVisibleCount((prev) => Math.min(prev + loadMoreCount, sessions.length));
  }, [loadMoreCount, sessions.length]);

  const loadAllSessions = useCallback(() => {
    setVisibleCount(sessions.length);
  }, [sessions.length]);

  const resetPagination = useCallback(() => {
    setVisibleCount(initialCount);
  }, [initialCount]);

  return {
    visibleSessions,
    hasMoreSessions,
    isShowingAll,
    hiddenCount,
    loadMoreSessions,
    loadAllSessions,
    resetPagination,
  };
}
