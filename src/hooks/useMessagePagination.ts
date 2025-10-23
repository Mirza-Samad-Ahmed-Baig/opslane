import { useState, useMemo, useCallback } from 'react';
import type { DisplayMessage } from '@/types/messages';

interface UseMessagePaginationOptions {
  messages: DisplayMessage[];
  initialCount?: number; // How many messages to show initially
  loadMoreCount?: number; // How many to load per "load more" action
}

interface UseMessagePaginationReturn {
  visibleMessages: DisplayMessage[];
  hasMoreMessages: boolean;
  loadMoreMessages: () => void;
  loadAllMessages: () => void;
  isShowingAll: boolean;
}

/**
 * Hook for paginating message display
 * Shows the LAST N messages initially (most recent), with ability to load older messages
 *
 * This optimizes initial render performance by reducing DOM nodes,
 * while keeping recent messages (what users care about) immediately visible.
 */
export function useMessagePagination({
  messages,
  initialCount = 50,
  loadMoreCount = 50,
}: UseMessagePaginationOptions): UseMessagePaginationReturn {
  const [visibleCount, setVisibleCount] = useState(initialCount);

  const visibleMessages = useMemo(() => {
    // Show the LAST N messages (most recent)
    // This ensures newest messages are always visible
    return messages.slice(-visibleCount);
  }, [messages, visibleCount]);

  const hasMoreMessages = messages.length > visibleCount;
  const isShowingAll = visibleCount >= messages.length;

  const loadMoreMessages = useCallback(() => {
    setVisibleCount((prev) => Math.min(prev + loadMoreCount, messages.length));
  }, [loadMoreCount, messages.length]);

  const loadAllMessages = useCallback(() => {
    setVisibleCount(messages.length);
  }, [messages.length]);

  return {
    visibleMessages,
    hasMoreMessages,
    loadMoreMessages,
    loadAllMessages,
    isShowingAll,
  };
}
