// Base message envelope (from Claude Code's actual format)
export interface MessageEnvelope {
  id: string;
  uuid: string;
  parentUuid: string | null;
  messageType: 'user' | 'assistant' | 'file-history-snapshot' | 'system';
  role?: 'user' | 'assistant';
  contentBlocks: ContentBlock[];
  usage?: UsageInfo;
  requestId?: string;
  sessionId: string;
  gitBranch?: string;
  cwd?: string;
  isSidechain?: boolean;
  userType?: string; // "external" = messages from external user (human), not internal Claude Code
}

// Content block types
export type ContentBlock =
  | TextBlock
  | ToolUseBlock
  | ToolResultBlock
  | ThinkingBlock
  | FileHistoryBlock
  | ImageBlock;

export interface TextBlock {
  type: 'text';
  text: string;
}

export interface ToolUseBlock {
  type: 'tool_use';
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface ToolResultBlock {
  type: 'tool_result';
  toolUseId: string;
  content: string;
  isError: boolean;
}

export interface ThinkingBlock {
  type: 'thinking';
  thinking: string;
  signature?: string;
}

export interface FileHistoryBlock {
  type: 'file_history_snapshot';
  messageId: string;
  trackedFiles: Record<string, FileBackup>;
  isSnapshotUpdate: boolean;
}

export interface FileBackup {
  backupFileName: string | null;
  version: number;
  backupTime: string;
}

// Supported image MIME types
export type ImageMediaType = 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp';

export interface ImageBlock {
  type: 'image';
  source: {
    media_type: ImageMediaType;
  } & (
    | { type: 'path'; path: string } // Filesystem path to the image file
    | { type: 'base64'; data: string } // Base64 data URL (includes data:image/...;base64, prefix)
  );
}

// Type guards for content blocks
export function isTextBlock(block: ContentBlock): block is TextBlock {
  return block.type === 'text' && 'text' in block;
}

export function isToolUseBlock(block: ContentBlock): block is ToolUseBlock {
  return block.type === 'tool_use' && 'id' in block && 'name' in block;
}

export function isToolResultBlock(block: ContentBlock): block is ToolResultBlock {
  return block.type === 'tool_result' && 'toolUseId' in block;
}

export function isThinkingBlock(block: ContentBlock): block is ThinkingBlock {
  return block.type === 'thinking' && 'thinking' in block;
}

export function isImageBlock(block: ContentBlock): block is ImageBlock {
  return block.type === 'image' && 'source' in block;
}

// Token usage info
export interface UsageInfo {
  inputTokens?: number;
  outputTokens?: number;
  cacheCreationInputTokens?: number;
  cacheReadInputTokens?: number;
}

// Display message (transformed for UI)
export interface DisplayMessage {
  id: string;
  uuid: string;
  role: 'user' | 'assistant';
  status: MessageStatus;

  // Content
  text?: string;
  tools?: ToolExecution[];
  thinking?: string;
  fileChanges?: FileSummary;
  images?: ImageAttachment[];

  // Metadata
  usage?: UsageInfo;
  requestId?: string;
}

export interface ImageAttachment {
  source: {
    media_type: ImageMediaType;
  } & ({ type: 'path'; path: string } | { type: 'base64'; data: string });
}

// Content block input types for sending messages to backend
export type ContentBlockInput = TextBlockInput | ImageBlockInput;

export interface TextBlockInput {
  type: 'text';
  text: string;
}

export interface ImageBlockInput {
  type: 'image';
  source: {
    media_type: ImageMediaType;
  } & ({ type: 'path'; path: string } | { type: 'base64'; data: string });
}

export interface ToolExecution {
  id: string;
  name: string;
  input: Record<string, unknown>;
  result?: {
    content: string;
    isError: boolean;
  };
  expanded: boolean; // UI state for progressive disclosure
}

export interface FileSummary {
  count: number;
  files: string[];
}

export type MessageStatus = 'sending' | 'sent' | 'error' | 'streaming' | 'complete';

// Streaming events (existing, keep for real-time updates)
export type StreamEvent =
  | { type: 'text_delta'; content: string }
  | { type: 'tool_use'; tool_name: string }
  | { type: 'tool_result'; tool_name: string; success: boolean }
  | { type: 'error'; message: string }
  | { type: 'cancelled' }
  | { type: 'complete' };
