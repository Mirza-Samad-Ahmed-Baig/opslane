import { useEffect, useState, useCallback, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen, UnlistenFn } from '@tauri-apps/api/event';
import type { MessageEnvelope, DisplayMessage, StreamEvent, ToolExecution } from '@/types/messages';
import { isTextBlock, isToolUseBlock, isToolResultBlock, isThinkingBlock } from '@/types/messages';

interface UseChatMessagesOptions {
  sessionId: string;
  initialMessage?: string;
  onStreamStart?: () => void;
  onStreamComplete?: () => void;
  onError?: (error: string) => void;
}

interface UseChatMessagesReturn {
  messages: DisplayMessage[];
  isLoading: boolean;
  isSending: boolean;
  error: string | null;
  sendMessage: (content: string) => Promise<void>;
  clearError: () => void;
}

// Generate unique message ID with collision resistance
function generateMessageId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

export function useChatMessages({
  sessionId,
  initialMessage,
  onStreamStart,
  onStreamComplete,
  onError,
}: UseChatMessagesOptions): UseChatMessagesReturn {
  // Initialize with initial message if provided
  const [messages, setMessages] = useState<DisplayMessage[]>(() => {
    if (initialMessage) {
      return [
        {
          id: generateMessageId('initial'),
          uuid: generateMessageId('initial-uuid'),
          role: 'user',
          text: initialMessage,
          status: 'sent',
        },
      ];
    }
    return [];
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Use ref to avoid race condition with effect dependencies
  const previousMessageLengthRef = useRef(0);

  // Transform backend message to display format
  const transformMessage = useCallback((envelope: MessageEnvelope): DisplayMessage | null => {
    // WHITELIST: Only display conversation and file history messages
    const DISPLAYABLE_TYPES = ['user', 'assistant', 'file-history-snapshot'];

    if (!DISPLAYABLE_TYPES.includes(envelope.messageType)) {
      // Filter out internal messages: system, warmup, heartbeat, connected, complete
      console.debug(
        `[useChatMessages] Filtered non-displayable message type: ${envelope.messageType}`
      );
      return null;
    }

    // Additional safety check for system messages
    // (Claude Code may send system messages with various subtypes)
    if (envelope.messageType === 'system') {
      console.debug('[useChatMessages] Filtered system message');
      return null;
    }

    // Use type guards for safer extraction
    const textBlocks = envelope.contentBlocks.filter(isTextBlock);
    const text = textBlocks.map((b) => b.text).join('\n');

    const toolUseBlocks = envelope.contentBlocks.filter(isToolUseBlock);
    const toolResultBlocks = envelope.contentBlocks.filter(isToolResultBlock);

    const tools: ToolExecution[] = toolUseBlocks.map((toolUse) => {
      const result = toolResultBlocks.find((r) => r.toolUseId === toolUse.id);

      return {
        id: toolUse.id,
        name: toolUse.name,
        input: toolUse.input,
        result: result
          ? {
              content: result.content,
              isError: result.isError,
            }
          : undefined,
        expanded: false, // Default collapsed (Progressive Disclosure)
      };
    });

    const thinkingBlocks = envelope.contentBlocks.filter(isThinkingBlock);
    const thinking = thinkingBlocks.length > 0 ? thinkingBlocks[0]?.thinking : undefined;

    // Validate that message has displayable content
    const hasText = text && text.trim().length > 0;
    const hasTools = tools.length > 0;
    const hasThinking = thinking && thinking.length > 0;

    // Skip messages with no displayable content
    // (This prevents empty user messages from showing)
    if (!hasText && !hasTools && !hasThinking) {
      return null;
    }

    return {
      id: envelope.id,
      uuid: envelope.uuid,
      role: envelope.role || 'assistant',
      status: 'complete',
      text: hasText ? text : undefined, // Only include text if non-empty
      tools: tools.length > 0 ? tools : undefined,
      thinking,
      usage: envelope.usage,
      requestId: envelope.requestId,
    };
  }, []);

  // Load message history on mount
  useEffect(() => {
    let cancelled = false;

    const loadHistory = async () => {
      try {
        setIsLoading(true);
        setError(null);

        // Call get_messages command (now returns structured data)
        const envelopes = await invoke<MessageEnvelope[]>('get_messages', { sessionId });

        if (cancelled) return;

        // Transform to DisplayMessage format
        const displayMessages = envelopes
          .map(transformMessage)
          .filter((msg): msg is DisplayMessage => msg !== null);

        if (!cancelled) {
          // If we have real messages, replace the optimistic initial message
          if (displayMessages.length > 0) {
            setMessages(displayMessages);
          }
          // Otherwise keep showing the initial message

          previousMessageLengthRef.current = displayMessages.length;
        }
      } catch (err) {
        if (!cancelled) {
          const errorMsg = err instanceof Error ? err.message : 'Failed to load messages';

          // Phase 1: Don't show error for brand new sessions where JSONL doesn't exist yet
          // Common errors for new sessions:
          // - "Session file not found" (expected for sessions being set up)
          // - "No such file" (JSONL hasn't been created yet)
          const isExpectedNewSessionError =
            errorMsg.includes('Session file not found') ||
            errorMsg.includes('No such file') ||
            errorMsg.includes('not found') ||
            errorMsg.includes('does not exist');

          if (!isExpectedNewSessionError) {
            // Only show real errors
            setError(errorMsg);
            onError?.(errorMsg);
          }
          // For expected errors, we just keep showing the optimistic message
          console.debug('[useChatMessages] Expected error for new session:', errorMsg);
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    loadHistory();

    return () => {
      cancelled = true;
    };
  }, [sessionId, transformMessage, onError]);

  // Listen for streaming events
  useEffect(() => {
    let unlisten: UnlistenFn | null = null;

    const setupListener = async () => {
      const eventChannel = `message-stream-${sessionId}`;

      unlisten = await listen<StreamEvent>(eventChannel, (event) => {
        const streamEvent = event.payload;

        switch (streamEvent.type) {
          case 'text_delta': {
            // Parse JSONL content from streaming event
            // Backend sends complete JSONL lines (e.g., '{"type":"user","uuid":"..."}\n')
            const lines = streamEvent.content.split('\n').filter((line) => line.trim());

            setMessages((prev) => {
              const updatedMessages = [...prev];

              for (const line of lines) {
                try {
                  // Parse JSONL line as MessageEnvelope
                  const envelope = JSON.parse(line) as MessageEnvelope;

                  // Transform to DisplayMessage (with filtering)
                  const displayMessage = transformMessage(envelope);

                  if (displayMessage) {
                    // Check if message already exists (by uuid)
                    const existingIndex = updatedMessages.findIndex(
                      (m) => m.uuid === displayMessage.uuid
                    );

                    if (existingIndex >= 0) {
                      // Update existing message (streaming content updates)
                      updatedMessages[existingIndex] = {
                        ...updatedMessages[existingIndex],
                        ...displayMessage,
                        status: 'streaming' as const,
                      };
                    } else {
                      // Add new message
                      updatedMessages.push({
                        ...displayMessage,
                        status: 'streaming' as const,
                      });
                    }
                  }
                } catch (e) {
                  // Not valid JSONL - might be error message or non-JSON output
                  console.warn('[useChatMessages] Failed to parse streaming JSONL:', e, line);
                }
              }

              return updatedMessages;
            });
            break;
          }

          case 'complete': {
            // Mark all streaming messages as complete
            setMessages((prev) =>
              prev.map((msg) =>
                msg.status === 'streaming' ? { ...msg, status: 'complete' as const } : msg
              )
            );
            setIsSending(false);
            onStreamComplete?.();
            break;
          }

          case 'error': {
            setMessages((prev) => [
              ...prev,
              {
                id: generateMessageId('error'),
                uuid: generateMessageId('error-uuid'),
                role: 'assistant' as const,
                text: `Error: ${streamEvent.message}`,
                status: 'error' as const,
              },
            ]);
            setIsSending(false);
            onError?.(streamEvent.message);
            break;
          }
        }
      });
    };

    setupListener();

    return () => {
      if (unlisten) {
        unlisten();
      }
    };
  }, [sessionId, onStreamComplete, onError]);

  // Send message function
  const sendMessage = useCallback(
    async (content: string) => {
      if (!content.trim() || isSending) return;

      try {
        setIsSending(true);
        setError(null);
        onStreamStart?.();

        // Add user message optimistically with collision-resistant ID
        const userMsgId = generateMessageId('user');
        const userMessage: DisplayMessage = {
          id: userMsgId,
          uuid: generateMessageId('user-uuid'),
          role: 'user',
          text: content.trim(),
          status: 'sending',
        };
        setMessages((prev) => [...prev, userMessage]);

        // Call send_message command (returns immediately, streams via events)
        await invoke('send_message', {
          sessionId,
          content: content.trim(),
        });

        // Mark user message as sent
        setMessages((prev) =>
          prev.map((msg) => (msg.id === userMsgId ? { ...msg, status: 'sent' as const } : msg))
        );
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Failed to send message';
        setError(errorMsg);
        setIsSending(false);
        onError?.(errorMsg);
      }
    },
    [sessionId, isSending, onStreamStart, onError]
  );

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  return {
    messages,
    isLoading,
    isSending,
    error,
    sendMessage,
    clearError,
  };
}
