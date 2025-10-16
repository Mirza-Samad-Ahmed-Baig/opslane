export type MessageRole = 'user' | 'assistant';
export type MessageStatus = 'sending' | 'sent' | 'error' | 'streaming' | 'complete';

export interface Message {
  id: string;
  role: MessageRole;
  timestamp: string;
  status: MessageStatus;
}

export interface TextMessage extends Message {
  type: 'text';
  content: string;
}

export interface ToolUseMessage extends Message {
  type: 'tool_use';
  role: 'assistant';
  toolName: string;
  toolInput?: Record<string, unknown>;
  toolResult?: {
    success: boolean;
    output?: string;
    error?: string;
  };
}

export interface ErrorMessage extends Message {
  type: 'error';
  error: string;
}

export type ChatMessage = TextMessage | ToolUseMessage | ErrorMessage;

// Streaming events from backend (matches StreamEvent enum in Rust)
export type StreamEvent =
  | { type: 'text_delta'; content: string }
  | { type: 'tool_use'; tool_name: string }
  | { type: 'tool_result'; tool_name: string; success: boolean }
  | { type: 'error'; message: string }
  | { type: 'complete' };
