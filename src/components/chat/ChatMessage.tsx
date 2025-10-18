import type { DisplayMessage } from '@/types/messages';
import { User, Bot, Wrench, CheckCircle, XCircle } from 'lucide-react';
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

        {/* Tool badges (basic display, detailed widgets in Phase 3) */}
        {message.tools && message.tools.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {message.tools.map((tool) => (
              <div
                key={tool.id}
                className="flex items-center gap-1.5 rounded-md border bg-background px-2 py-1 text-xs"
              >
                <Wrench className="h-3 w-3" />
                <span className="font-medium">{tool.name}</span>
                {tool.result &&
                  (tool.result.isError ? (
                    <XCircle className="h-3 w-3 text-destructive" />
                  ) : (
                    <CheckCircle className="h-3 w-3 text-status-success-fg" />
                  ))}
              </div>
            ))}
          </div>
        )}

        {/* Show "No content" only if truly empty */}
        {(!message.text || message.text.trim().length === 0) &&
          (!message.tools || message.tools.length === 0) && (
            <div className="text-sm text-muted-foreground/60 italic">No displayable content</div>
          )}

        {/* Timestamp (subtle, lower contrast per Calm Technology) */}
        <p className="text-xs text-muted-foreground/60">
          {new Date(message.timestamp).toLocaleTimeString()}
        </p>
      </div>
    </div>
  );
}
