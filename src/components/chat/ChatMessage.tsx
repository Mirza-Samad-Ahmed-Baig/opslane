import type { ChatMessage } from '@/types/messages';
import { User, Bot, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface ChatMessageProps {
  message: ChatMessage;
}

export function ChatMessage({ message }: ChatMessageProps) {
  const isUser = message.role === 'user';

  return (
    <div
      role="article"
      aria-label={`${message.role} message`}
      className={cn('flex gap-3 mb-4', isUser ? 'justify-end' : 'justify-start')}
    >
      {!isUser && (
        <div
          className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-500/10 flex items-center justify-center"
          aria-hidden="true"
        >
          <Bot className="h-4 w-4 text-blue-600 dark:text-blue-400" />
        </div>
      )}

      <div
        className={cn(
          'max-w-[75%] rounded-lg px-4 py-2',
          isUser
            ? 'bg-primary text-primary-foreground'
            : message.type === 'error'
              ? 'bg-status-error-bg text-status-error-fg border border-status-error-border'
              : 'bg-muted'
        )}
      >
        {message.type === 'text' && (
          <div className="prose prose-sm dark:prose-invert max-w-none">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown>
          </div>
        )}

        {message.type === 'tool_use' && (
          <div className="text-sm">
            <div className="font-medium mb-1">Tool: {message.toolName}</div>
            {message.toolResult && (
              <div
                className={cn(
                  'text-xs font-medium',
                  message.toolResult.success ? 'text-status-success-fg' : 'text-status-error-fg'
                )}
              >
                {message.toolResult.success ? '✓ Success' : '✗ Failed'}
              </div>
            )}
          </div>
        )}

        {message.type === 'error' && (
          <div className="flex items-start gap-2">
            <AlertCircle className="h-4 w-4 mt-0.5" />
            <div className="text-sm">{message.error}</div>
          </div>
        )}

        <div className="text-xs opacity-70 mt-1">
          {new Date(message.timestamp).toLocaleTimeString()}
        </div>
      </div>

      {isUser && (
        <div
          className="flex-shrink-0 w-8 h-8 rounded-full bg-purple-500/10 flex items-center justify-center"
          aria-hidden="true"
        >
          <User className="h-4 w-4 text-purple-600 dark:text-purple-400" />
        </div>
      )}
    </div>
  );
}
