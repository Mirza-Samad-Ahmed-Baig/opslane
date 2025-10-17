import { useEffect, useRef } from 'react';
import { useChatMessages } from '@/hooks/useChatMessages';
import { ChatMessage } from '@/components/chat/ChatMessage';
import { ChatInput } from '@/components/chat/ChatInput';
import { TypingIndicator } from '@/components/chat/TypingIndicator';
import { Alert } from '@/components/ui/alert';
import { Loader2 } from 'lucide-react';

interface MessagePanelProps {
  sessionId: string;
  initialMessage?: string;
}

/**
 * MessagePanel - Center panel for chat messages and input
 * Full implementation with streaming support
 */
export function MessagePanel({ sessionId, initialMessage }: MessagePanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const previousMessageCountRef = useRef(0);

  const { messages, isLoading, isSending, error, sendMessage, clearError } = useChatMessages({
    sessionId,
    initialMessage, // Pass to hook
  });

  // Auto-scroll to bottom only when new messages are added
  useEffect(() => {
    if (messages.length > previousMessageCountRef.current && scrollRef.current) {
      scrollRef.current.scrollIntoView({ behavior: 'smooth' });
      previousMessageCountRef.current = messages.length;
    }
  }, [messages.length]);

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Error banner */}
      {error && (
        <Alert variant="error" className="m-4 mb-0">
          <div className="flex items-center justify-between">
            <span>{error}</span>
            <button
              onClick={clearError}
              className="text-xs underline hover:no-underline focus:outline-none focus:ring-2 focus:ring-status-error-fg rounded px-1"
              aria-label="Dismiss error message"
            >
              Dismiss
            </button>
          </div>
        </Alert>
      )}

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto p-4">
        {isLoading ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center space-y-2">
              <Loader2 className="h-8 w-8 animate-spin mx-auto text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Loading messages...</p>
            </div>
          </div>
        ) : messages.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center space-y-2">
              <p className="text-lg font-medium">No messages yet</p>
              <p className="text-sm text-muted-foreground">
                Start a conversation with Claude below
              </p>
            </div>
          </div>
        ) : (
          <>
            {messages.map((message) => (
              <ChatMessage key={message.id} message={message} />
            ))}
            {isSending && <TypingIndicator />}
            <div ref={scrollRef} />
          </>
        )}
      </div>

      {/* Input area */}
      <ChatInput
        onSend={sendMessage}
        disabled={isSending || isLoading}
        placeholder="Ask Claude to help with your code..."
      />
    </div>
  );
}
