import { Bot } from 'lucide-react';

export function TypingIndicator() {
  return (
    <div
      className="flex gap-3 mb-4"
      role="status"
      aria-live="polite"
      aria-label="Assistant is typing"
    >
      <div
        className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-500/10 flex items-center justify-center"
        aria-hidden="true"
      >
        <Bot className="h-4 w-4 text-blue-600 dark:text-blue-400" />
      </div>
      <div className="bg-muted rounded-lg px-4 py-2">
        <div className="flex gap-1">
          <div className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce [animation-delay:0ms]" />
          <div className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce [animation-delay:150ms]" />
          <div className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce [animation-delay:300ms]" />
        </div>
      </div>
      <span className="sr-only">Assistant is typing</span>
    </div>
  );
}
