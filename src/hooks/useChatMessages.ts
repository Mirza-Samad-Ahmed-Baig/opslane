import { useEffect, useState, useCallback, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen, UnlistenFn } from '@tauri-apps/api/event';
import type { ChatMessage, StreamEvent } from '@/types/messages';

interface UseChatMessagesOptions {
  sessionId: string;
  initialMessage?: string;
  onStreamStart?: () => void;
  onStreamComplete?: () => void;
  onError?: (error: string) => void;
}

interface UseChatMessagesReturn {
  messages: ChatMessage[];
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
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    if (initialMessage) {
      return [
        {
          id: `initial-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          role: 'user',
          type: 'text',
          content: initialMessage,
          timestamp: new Date().toISOString(),
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
  const currentStreamingMessageIdRef = useRef<string | null>(null);
  const previousMessageLengthRef = useRef(0);

  // Load message history on mount
  useEffect(() => {
    let cancelled = false;

    const loadHistory = async () => {
      try {
        setIsLoading(true);
        setError(null);

        // Call get_messages command (returns JSONL string)
        const historyRaw = await invoke<string>('get_messages', { sessionId });

        if (cancelled) return;

        // Parse JSONL (each line is a JSON object) with error handling
        const lines = historyRaw
          .trim()
          .split('\n')
          .filter((line) => line.trim());
        const parsed = lines
          .map((line) => {
            try {
              return JSON.parse(line);
            } catch (e) {
              console.error('Failed to parse message line:', line, e);
              return null;
            }
          })
          .filter(Boolean);

        // Transform to ChatMessage format (simplified - full logic in actual implementation)
        const transformed: ChatMessage[] = parsed
          .filter((item) => item.type === 'user' || item.type === 'assistant')
          .map((item, index) => ({
            id: item.message?.id || generateMessageId(`msg-${index}`),
            role: item.type as 'user' | 'assistant',
            type: 'text' as const,
            content: item.message?.content?.[0]?.text || '',
            timestamp: item.timestamp || new Date().toISOString(),
            status: 'complete' as const,
          }));

        if (!cancelled) {
          // If we have real messages, replace the optimistic initial message
          if (transformed.length > 0) {
            setMessages(transformed);
          }
          // Otherwise keep showing the initial message

          previousMessageLengthRef.current = transformed.length;
        }
      } catch (err) {
        if (!cancelled) {
          const errorMsg = err instanceof Error ? err.message : 'Failed to load messages';
          setError(errorMsg);
          onError?.(errorMsg);
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
  }, [sessionId, onError]);

  // Listen for streaming events
  useEffect(() => {
    let unlisten: UnlistenFn | null = null;

    const setupListener = async () => {
      const eventChannel = `message-stream-${sessionId}`;

      unlisten = await listen<StreamEvent>(eventChannel, (event) => {
        const streamEvent = event.payload;

        switch (streamEvent.type) {
          case 'text_delta': {
            setMessages((prev) => {
              if (currentStreamingMessageIdRef.current) {
                // Append to existing message
                return prev.map((msg) =>
                  msg.id === currentStreamingMessageIdRef.current && msg.type === 'text'
                    ? { ...msg, content: msg.content + streamEvent.content }
                    : msg
                );
              } else {
                // Create new assistant message
                const newId = generateMessageId('msg');
                currentStreamingMessageIdRef.current = newId;
                return [
                  ...prev,
                  {
                    id: newId,
                    role: 'assistant' as const,
                    type: 'text' as const,
                    content: streamEvent.content,
                    timestamp: new Date().toISOString(),
                    status: 'streaming' as const,
                  },
                ];
              }
            });
            break;
          }

          case 'complete': {
            if (currentStreamingMessageIdRef.current) {
              setMessages((prev) => {
                const updated = prev.map((msg) =>
                  msg.id === currentStreamingMessageIdRef.current
                    ? { ...msg, status: 'complete' as const }
                    : msg
                );
                previousMessageLengthRef.current = updated.length;
                return updated;
              });
            }
            currentStreamingMessageIdRef.current = null;
            setIsSending(false);
            onStreamComplete?.();
            break;
          }

          case 'error': {
            setMessages((prev) => [
              ...prev,
              {
                id: generateMessageId('error'),
                role: 'assistant' as const,
                type: 'error' as const,
                error: streamEvent.message,
                timestamp: new Date().toISOString(),
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
  }, [sessionId, onStreamComplete, onError]); // Fixed: removed currentStreamingMessageId from deps

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
        const userMessage: ChatMessage = {
          id: userMsgId,
          role: 'user',
          type: 'text',
          content: content.trim(),
          timestamp: new Date().toISOString(),
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
