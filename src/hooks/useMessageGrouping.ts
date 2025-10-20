import { useMemo } from 'react';
import type { DisplayMessage, ToolExecution } from '@/types/messages';

export interface MessageGroup {
  type: 'message' | 'tool-group';
  id: string; // Unique ID for React keys

  // For type: 'message'
  message?: DisplayMessage;

  // For type: 'tool-group'
  tools?: ToolExecution[];
  messageId?: string; // Parent message ID
}

/**
 * Group messages and tool calls for display
 *
 * Algorithm:
 * 1. Iterate through messages
 * 2. If message has tools, collect them into a tool group
 * 3. If message has text, create a message group
 * 4. Consecutive tool-only messages merge into a single tool group
 *
 * @param messages Array of display messages
 * @returns Grouped messages for rendering
 */
export function useMessageGrouping(messages: DisplayMessage[]): MessageGroup[] {
  return useMemo(() => {
    const groups: MessageGroup[] = [];
    let currentToolGroup: ToolExecution[] = [];
    let currentToolGroupMessageId: string | null = null;

    messages.forEach((msg, index) => {
      const hasText = msg.text && msg.text.trim().length > 0;
      const hasTools = msg.tools && msg.tools.length > 0;

      // Case 1: Message has text content
      if (hasText) {
        // Flush any accumulated tool group first
        if (currentToolGroup.length > 0) {
          groups.push({
            type: 'tool-group',
            id: `tool-group-${currentToolGroupMessageId}`,
            tools: currentToolGroup,
            messageId: currentToolGroupMessageId!,
          });
          currentToolGroup = [];
          currentToolGroupMessageId = null;
        }

        // Add message group (text)
        groups.push({
          type: 'message',
          id: msg.uuid,
          message: msg,
        });

        // If message also has tools, start a new tool group
        if (hasTools) {
          currentToolGroup = [...msg.tools!]; // Copy array to avoid mutations
          currentToolGroupMessageId = msg.uuid;
        }
      }
      // Case 2: Message has only tools (no text)
      else if (hasTools) {
        // Accumulate tools into current group (immutable append)
        currentToolGroup = [...currentToolGroup, ...msg.tools!];
        if (!currentToolGroupMessageId) {
          currentToolGroupMessageId = msg.uuid;
        }
      }
      // Case 3: Empty message (shouldn't happen, but handle gracefully)
      else {
        // Flush tool group
        if (currentToolGroup.length > 0) {
          groups.push({
            type: 'tool-group',
            id: `tool-group-${currentToolGroupMessageId}`,
            tools: currentToolGroup,
            messageId: currentToolGroupMessageId!,
          });
          currentToolGroup = [];
          currentToolGroupMessageId = null;
        }
      }

      // Flush remaining tool group at end
      if (index === messages.length - 1 && currentToolGroup.length > 0) {
        groups.push({
          type: 'tool-group',
          id: `tool-group-${currentToolGroupMessageId}`,
          tools: currentToolGroup,
          messageId: currentToolGroupMessageId!,
        });
      }
    });

    return groups;
  }, [messages]);
}
