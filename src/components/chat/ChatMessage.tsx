import type { DisplayMessage } from '@/types/messages';
import { User, Bot } from 'lucide-react';
import { cn } from '@/lib/utils';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface ChatMessageProps {
  message: DisplayMessage;
}

export function ChatMessage({ message }: ChatMessageProps) {
  const isUser = message.role === 'user';

  return (
    <div
      className={cn(
        'flex gap-3 p-4 rounded-lg animate-fadeIn mb-4', // Calm animation (200ms fade), mb-4 for consistent spacing
        isUser ? 'bg-primary/10 ml-12' : 'bg-muted/50 mr-12'
      )}
    >
      {/* Avatar */}
      <div
        className={cn(
          'flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
          isUser ? 'bg-primary' : 'bg-muted'
        )}
      >
        {isUser ? (
          <User className="h-4 w-4 text-primary-foreground" />
        ) : (
          <Bot className="h-4 w-4 text-muted-foreground" />
        )}
      </div>

      {/* Content */}
      <div className="flex-1 space-y-2">
        {/* Text content */}
        {message.text && message.text.trim().length > 0 && (
          <div className="prose prose-sm dark:prose-invert max-w-none">
            {isUser ? (
              <p className="text-sm">{message.text}</p>
            ) : (
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.text}</ReactMarkdown>
            )}
          </div>
        )}

        {/* Tools are now rendered separately by MessagePanel via ToolMessageGroup */}
        {/* This keeps text-only messages clean and allows proper grouping */}

        {/* Show "No content" only if truly empty */}
        {(!message.text || message.text.trim().length === 0) && (
          <div className="text-sm text-muted-foreground/60 italic">No displayable content</div>
        )}
      </div>
    </div>
  );
}
