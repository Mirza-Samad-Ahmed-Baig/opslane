import { useEffect, useRef, useMemo, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useChatMessages } from '@/hooks/useChatMessages';
import { ChatMessage } from '@/components/chat/ChatMessage';
import { ChatInput } from '@/components/chat/ChatInput';
import { TypingIndicator } from '@/components/chat/TypingIndicator';
import { SessionSetupProgress } from '@/components/SessionSetupProgress';
import { Loader2, X, AlertCircle } from 'lucide-react';
import type { DisplayMessage } from '@/types/messages';

interface MessagePanelProps {
  sessionId: string;
  optimisticMessage?: DisplayMessage | null;
  isSettingUp?: boolean;
}

/**
 * MessagePanel - Center panel for chat messages and input
 * Full implementation with streaming support and virtual scrolling for performance
 */
export function MessagePanel({ sessionId, optimisticMessage, isSettingUp }: MessagePanelProps) {
  const parentRef = useRef<HTMLDivElement>(null);
  const isAtBottomRef = useRef(true);

  const { messages, isLoading, isSending, error, sendMessage, clearError } = useChatMessages({
    sessionId,
  });

  // Phase 1: Merge optimistic message with real messages
  // Show optimistic message if we have one and no real user message yet
  const displayMessages = useMemo(() => {
    const realMessages = messages;

    if (optimisticMessage && !realMessages.some((m) => m.role === 'user')) {
      // Show optimistic message first (user's message from DB)
      return [optimisticMessage, ...realMessages];
    }

    return realMessages;
  }, [optimisticMessage, messages]);

  // Phase 1: Detect when we're waiting for Claude's initial response
  // This happens when:
  // 1. We have an optimistic message (user's message from DB)
  // 2. Session setup is complete (not setting up anymore)
  // 3. We don't have any assistant messages yet (Claude hasn't responded)
  const [waitingTimeout, setWaitingTimeout] = useState(false);

  const isWaitingForClaudeResponse =
    !!optimisticMessage &&
    !isSettingUp &&
    !displayMessages.some((m) => m.role === 'assistant') &&
    !waitingTimeout;

  // BLOCKER FIX: Add timeout for waiting state (60 seconds)
  useEffect(() => {
    if (!isWaitingForClaudeResponse) {
      setWaitingTimeout(false);
      return;
    }

    const timeoutId = setTimeout(() => {
      setWaitingTimeout(true);
      console.warn('[MessagePanel] Timeout waiting for Claude response');
    }, 60000); // 60 second timeout

    return () => clearTimeout(timeoutId);
  }, [isWaitingForClaudeResponse]);

  // Virtual scrolling (enabled for >50 messages per Performance Budget)
  const virtualizer = useVirtualizer({
    count: displayMessages.length,
    getScrollElement: () => parentRef.current,
    estimateSize: (index) => {
      // Dynamic height estimation based on message content
      const message = displayMessages[index];
      if (!message) return 100;

      let height = 80; // Base height (avatar + padding + timestamp)

      // Add height for text content (rough estimate: ~20px per 80 chars)
      if (message.text) {
        const lines = Math.ceil(message.text.length / 80);
        height += Math.min(lines * 20, 300); // Cap at 300px for very long messages
      }

      // Add height for tool badges (~40px per tool)
      if (message.tools?.length) {
        height += message.tools.length * 40;
      }

      // Add margin
      height += 16; // mb-4 margin

      return height;
    },
    overscan: 5, // Render 5 extra items above/below viewport
    enabled: displayMessages.length > 50, // Only virtualize for performance-critical lists
  });

  // Track if user is at bottom (for Calm Technology: don't interrupt scrolling)
  useEffect(() => {
    const parent = parentRef.current;
    if (!parent) return;

    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = parent;
      const isNearBottom = scrollTop + clientHeight >= scrollHeight - 50;
      isAtBottomRef.current = isNearBottom;
    };

    parent.addEventListener('scroll', handleScroll);
    return () => parent.removeEventListener('scroll', handleScroll);
  }, []);

  // Auto-scroll only if user is at bottom (Calm Technology principle)
  useEffect(() => {
    if (isAtBottomRef.current && displayMessages.length > 0) {
      // Smooth scroll to bottom
      parentRef.current?.scrollTo({
        top: parentRef.current.scrollHeight,
        behavior: 'smooth',
      });
    }
  }, [displayMessages.length]);

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Error banner (dismissible) */}
      {error && (
        <div className="flex items-center gap-2 bg-destructive/10 px-4 py-2 text-sm text-destructive">
          <AlertCircle className="h-4 w-4" />
          <span className="flex-1">{error}</span>
          <button
            onClick={clearError}
            className="rounded p-1 hover:bg-destructive/20"
            aria-label="Dismiss error"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Container setup progress (Phase 1) */}
      {isSettingUp && (
        <div className="p-4 bg-muted/50 border-b">
          <SessionSetupProgress sessionId={sessionId} />
        </div>
      )}

      {/* Message list with virtual scrolling */}
      <div
        ref={parentRef}
        className="flex-1 overflow-y-auto"
        style={{ overscrollBehavior: 'contain' }}
      >
        {isLoading ? (
          <div className="flex h-full items-center justify-center text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Loading messages...
          </div>
        ) : displayMessages.length === 0 && !isSettingUp ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-muted-foreground">
            <p className="text-sm">No messages yet</p>
            <p className="text-xs">Start a conversation with Claude</p>
          </div>
        ) : displayMessages.length > 50 ? (
          // Virtual scrolling for performance
          <div className="p-4">
            <div
              style={{
                height: `${virtualizer.getTotalSize()}px`,
                width: '100%',
                position: 'relative',
              }}
            >
              {virtualizer.getVirtualItems().map((virtualRow) => {
                const message = displayMessages[virtualRow.index];
                if (!message) return null;
                return (
                  <div
                    key={message.id}
                    data-index={virtualRow.index}
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '100%',
                      transform: `translateY(${virtualRow.start}px)`,
                    }}
                  >
                    <ChatMessage message={message} />
                  </div>
                );
              })}
            </div>

            {/* Streaming indicators */}
            {isSettingUp && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="text-sm">Setting up session...</span>
              </div>
            )}
            {(isSending || isWaitingForClaudeResponse) && !isSettingUp && <TypingIndicator />}
          </div>
        ) : (
          // Regular rendering for <50 messages (simpler, no virtualization overhead)
          <div className="space-y-4 p-4">
            {displayMessages.map((message) => (
              <ChatMessage key={message.id} message={message} />
            ))}

            {/* Setup indicator */}
            {isSettingUp && (
              <div
                className="flex items-center gap-2 text-muted-foreground"
                role="status"
                aria-live="polite"
                aria-label="Setting up session"
              >
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                <span className="text-sm">Setting up session...</span>
              </div>
            )}

            {/* Typing indicator (shown during streaming or waiting for initial response) */}
            {(isSending || isWaitingForClaudeResponse) && !isSettingUp && <TypingIndicator />}

            {/* BLOCKER FIX: Show message if waiting timed out */}
            {waitingTimeout && (
              <div className="text-sm text-muted-foreground text-center py-4" role="alert">
                Claude is taking longer than expected. You can try sending another message.
              </div>
            )}
          </div>
        )}
      </div>

      {/* Chat input */}
      <ChatInput
        onSend={sendMessage}
        disabled={isSending || isLoading || isSettingUp || isWaitingForClaudeResponse}
        placeholder={
          isSettingUp
            ? 'Setting up session...'
            : isWaitingForClaudeResponse
              ? 'Waiting for Claude...'
              : waitingTimeout
                ? 'Timed out - try sending a new message'
                : 'Ask Claude to help with your code...'
        }
      />
    </div>
  );
}
