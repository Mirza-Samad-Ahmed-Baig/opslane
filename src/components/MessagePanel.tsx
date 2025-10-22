import { useEffect, useRef, useMemo, useState, useCallback } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useChatMessages } from '@/hooks/useChatMessages';
import { useMessageGrouping } from '@/hooks/useMessageGrouping';
import { useCollapseState } from '@/hooks/useCollapseState';
import { ChatMessage } from '@/components/chat/ChatMessage';
import { ToolMessageGroup } from '@/components/chat/ToolMessageGroup';
import { ChatInput } from '@/components/chat/ChatInput';
import { TypingIndicator } from '@/components/chat/TypingIndicator';
import { SessionSetupProgress } from '@/components/SessionSetupProgress';
import { Loader2, X, AlertCircle, ChevronsDown, ChevronsUp } from 'lucide-react';
import type { DisplayMessage } from '@/types/messages';

// Virtual scrolling height estimation constants
const BASE_MESSAGE_HEIGHT = 80; // Base height for a message
const CHARS_PER_LINE = 80; // Estimated characters per line of text
const LINE_HEIGHT = 20; // Height per line of text
const MAX_TEXT_HEIGHT = 300; // Maximum height for text content
const MESSAGE_MARGIN = 16; // Bottom margin for messages
const SINGLE_TOOL_HEIGHT = 130; // Height for a single tool (average of collapsed/expanded)
const TOOL_GROUP_HEADER_HEIGHT = 60; // Height for tool group header
const TOOL_ITEM_HEIGHT = 60; // Height per tool item in a group
const DEFAULT_FALLBACK_HEIGHT = 150; // Fallback height when group is undefined
const VIRTUAL_SCROLL_OVERSCAN = 10; // Number of items to render outside viewport

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

  const { messages, isLoading, isSending, error, streamingTimeout, sendMessage, clearError } =
    useChatMessages({
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

  // Phase 2: Group messages and tool calls
  const messageGroups = useMessageGrouping(displayMessages);

  // Phase 3: Collapse state management
  const collapseState = useCollapseState(sessionId);

  // Helper function to calculate estimated height for a message group
  // Used by virtualizer.estimateSize for better initial estimates
  const getGroupEstimatedHeight = useCallback((group: (typeof messageGroups)[number]): number => {
    if (group.type === 'message') {
      const message = group.message!;
      let height = BASE_MESSAGE_HEIGHT;

      if (message.text) {
        const lines = Math.ceil(message.text.length / CHARS_PER_LINE);
        height += Math.min(lines * LINE_HEIGHT, MAX_TEXT_HEIGHT);
      }

      height += MESSAGE_MARGIN;
      return height;
    } else {
      // Tool group height estimation
      const toolCount = group.tools!.length;

      if (toolCount === 1) {
        return SINGLE_TOOL_HEIGHT;
      } else {
        return TOOL_GROUP_HEADER_HEIGHT + toolCount * TOOL_ITEM_HEIGHT;
      }
    }
  }, []);

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

  // Check if any messages are actively streaming (multi-turn support)
  // Note: streamingTimeout is now managed by useChatMessages hook (10-minute catastrophic timeout)
  const hasStreamingMessages =
    displayMessages.some((m) => m.status === 'streaming') && !streamingTimeout;

  // BLOCKER FIX: Add timeout for waiting state (60 seconds)
  useEffect(() => {
    if (!isWaitingForClaudeResponse) {
      setWaitingTimeout(false);
      return;
    }

    const timeoutId = setTimeout(() => {
      setWaitingTimeout(true);
      console.warn('[MessagePanel] Timeout waiting for Claude response', {
        sessionId,
        messageCount: displayMessages.length,
        hasOptimisticMessage: !!optimisticMessage,
        isSettingUp,
      });
    }, 60000); // 60 second timeout

    return () => clearTimeout(timeoutId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isWaitingForClaudeResponse]);

  // Virtual scrolling (enabled for >50 messages per Performance Budget)
  const virtualizer = useVirtualizer({
    count: messageGroups.length,
    getScrollElement: () => parentRef.current,
    estimateSize: (index) => {
      const group = messageGroups[index];
      if (!group) return DEFAULT_FALLBACK_HEIGHT;
      return getGroupEstimatedHeight(group);
    },
    overscan: VIRTUAL_SCROLL_OVERSCAN,
    enabled: messageGroups.length > 50, // Only virtualize for performance-critical lists
    // Allow virtualizer to measure actual heights dynamically for accurate positioning
    // Uses feature detection instead of browser sniffing for better reliability
    measureElement:
      typeof window !== 'undefined'
        ? (element) => {
            try {
              const height = element?.getBoundingClientRect().height;
              return height ?? DEFAULT_FALLBACK_HEIGHT;
            } catch (error) {
              // Fallback gracefully if measurement fails (e.g., in some Firefox versions)
              console.warn('[MessagePanel] measureElement failed, using fallback height:', error);
              return DEFAULT_FALLBACK_HEIGHT;
            }
          }
        : undefined,
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

      {/* Expand/Collapse toolbar (Phase 3) */}
      {displayMessages.length > 0 && messageGroups.some((g) => g.type === 'tool-group') && (
        <div className="flex items-center justify-end gap-2 px-4 py-2 border-b bg-muted/20">
          <button
            onClick={() => {
              // Collect all group and tool IDs
              const groupIds: string[] = [];
              const toolIds: string[] = [];

              messageGroups.forEach((group) => {
                if (group.type === 'tool-group') {
                  const groupId = `tool-group-${group.messageId}`;
                  groupIds.push(groupId);
                  group.tools?.forEach((tool) => {
                    toolIds.push(tool.id);
                  });
                }
              });

              collapseState.expandAll(groupIds, toolIds);
            }}
            className="flex items-center gap-1 px-2 py-1 text-xs rounded hover:bg-muted/50 transition-colors"
            aria-label="Expand all tool groups"
          >
            <ChevronsDown className="h-3 w-3" />
            <span>Expand All</span>
          </button>
          <button
            onClick={collapseState.collapseAll}
            className="flex items-center gap-1 px-2 py-1 text-xs rounded hover:bg-muted/50 transition-colors"
            aria-label="Collapse all tool groups"
          >
            <ChevronsUp className="h-3 w-3" />
            <span>Collapse All</span>
          </button>
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
        ) : messageGroups.length > 50 ? (
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
                const group = messageGroups[virtualRow.index];
                if (!group) return null;

                return (
                  <div
                    key={group.id}
                    data-index={virtualRow.index}
                    ref={(el) => {
                      if (el) {
                        try {
                          virtualizer.measureElement(el);
                        } catch (error) {
                          console.warn('[MessagePanel] Failed to measure element:', error);
                        }
                      }
                    }}
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '100%',
                      transform: `translateY(${virtualRow.start}px)`,
                    }}
                  >
                    {group.type === 'message' ? (
                      <ChatMessage message={group.message!} />
                    ) : (
                      <ToolMessageGroup
                        tools={group.tools!}
                        messageId={group.messageId!}
                        isGroupCollapsed={collapseState.isGroupCollapsed}
                        isToolCollapsed={collapseState.isToolCollapsed}
                        onGroupToggle={collapseState.toggleGroup}
                        onToolToggle={collapseState.toggleTool}
                      />
                    )}
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
            {(isSending || isWaitingForClaudeResponse || hasStreamingMessages) && !isSettingUp && (
              <TypingIndicator />
            )}

            {/* Timeout messages */}
            {waitingTimeout && (
              <div className="text-sm text-muted-foreground text-center py-4" role="alert">
                Claude is taking longer than expected. You can try sending another message.
              </div>
            )}
            {streamingTimeout && (
              <div className="text-sm text-muted-foreground text-center py-4" role="alert">
                No response from Claude for 10 minutes. The backend may have crashed. Please try
                refreshing or restarting the session.
              </div>
            )}
          </div>
        ) : (
          // Regular rendering for <50 messages (simpler, no virtualization overhead)
          <div className="space-y-4 p-4">
            {messageGroups.map((group) => {
              if (group.type === 'message') {
                return <ChatMessage key={group.id} message={group.message!} />;
              } else {
                // Tool group
                return (
                  <ToolMessageGroup
                    key={group.id}
                    tools={group.tools!}
                    messageId={group.messageId!}
                    isGroupCollapsed={collapseState.isGroupCollapsed}
                    isToolCollapsed={collapseState.isToolCollapsed}
                    onGroupToggle={collapseState.toggleGroup}
                    onToolToggle={collapseState.toggleTool}
                  />
                );
              }
            })}

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
            {(isSending || isWaitingForClaudeResponse || hasStreamingMessages) && !isSettingUp && (
              <TypingIndicator />
            )}

            {/* BLOCKER FIX: Show message if waiting timed out */}
            {waitingTimeout && (
              <div className="text-sm text-muted-foreground text-center py-4" role="alert">
                Claude is taking longer than expected. You can try sending another message.
              </div>
            )}

            {/* Show message if streaming timed out (catastrophic failure) */}
            {streamingTimeout && (
              <div className="text-sm text-muted-foreground text-center py-4" role="alert">
                No response from Claude for 10 minutes. The backend may have crashed. Please try
                refreshing or restarting the session.
              </div>
            )}
          </div>
        )}
      </div>

      {/* Chat input */}
      <ChatInput
        sessionId={sessionId}
        onSend={sendMessage}
        disabled={
          isSending ||
          isLoading ||
          isSettingUp ||
          isWaitingForClaudeResponse ||
          hasStreamingMessages
        }
        placeholder={
          isSettingUp
            ? 'Setting up session...'
            : isWaitingForClaudeResponse || hasStreamingMessages
              ? 'Claude is thinking...'
              : waitingTimeout || streamingTimeout
                ? 'Timed out - try sending a new message'
                : 'Ask Claude to help with your code...'
        }
      />
    </div>
  );
}
