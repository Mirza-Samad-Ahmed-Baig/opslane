import { useState } from 'react';
import { Send, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import type { ImageAttachment } from '@/types/messages';

interface ChatInputProps {
  sessionId: string; // Required for image copying in Phase 3
  onSend: (message: string, images?: ImageAttachment[]) => void;
  disabled?: boolean;
  placeholder?: string;
}

export function ChatInput({
  sessionId: _sessionId, // eslint-disable-line @typescript-eslint/no-unused-vars -- Will be used in Phase 3 for image handling
  onSend,
  disabled = false,
  placeholder = 'Type a message...',
}: ChatInputProps) {
  const [value, setValue] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!value.trim() || disabled) return;

    onSend(value.trim());
    setValue('');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="border-t p-4">
      <div className="flex gap-2">
        <Textarea
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          className="resize-none"
          rows={3}
          autoFocus
          aria-label="Chat message input"
          aria-describedby="chat-input-hint"
        />
        <Button
          type="submit"
          disabled={disabled || !value.trim()}
          size="icon"
          className="self-end"
          aria-label="Send message"
        >
          {disabled ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-label="Sending" />
          ) : (
            <Send className="h-4 w-4" />
          )}
        </Button>
      </div>
      <div id="chat-input-hint" className="text-xs text-muted-foreground mt-2">
        Press Enter to send, Shift+Enter for new line
      </div>
    </form>
  );
}
