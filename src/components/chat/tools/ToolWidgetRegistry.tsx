import { ComponentType } from 'react';
import type { ToolWidgetProps } from './BaseToolWidget';
import { GenericToolWidget } from './GenericToolWidget';
import { ReadToolWidget } from './ReadToolWidget';
import { BashToolWidget } from './BashToolWidget';
import { EditToolWidget } from './EditToolWidget';
import { TaskToolWidget } from './TaskToolWidget';

/**
 * Registry mapping tool names to their widget components
 *
 * Phase 1: All tools use GenericToolWidget fallback
 * Phase 4: Replace with tool-specific widgets
 */
const toolWidgetMap: Record<string, ComponentType<ToolWidgetProps>> = {
  Read: ReadToolWidget,
  Bash: BashToolWidget,
  Edit: EditToolWidget,
  Task: TaskToolWidget,
  // Future widgets:
  // Grep: GrepToolWidget,
  // Glob: GlobToolWidget,
  // Write: WriteToolWidget,
  // TodoWrite: TodoWriteToolWidget,
  // WebSearch: WebSearchToolWidget,
  // WebFetch: WebFetchToolWidget,
};

/**
 * Get the appropriate widget component for a tool
 * Falls back to GenericToolWidget if no specific widget exists
 *
 * @param toolName Name of the tool (e.g., "Read", "Bash")
 * @returns Widget component for rendering
 */
export function getToolWidget(toolName: string): ComponentType<ToolWidgetProps> {
  return toolWidgetMap[toolName] || GenericToolWidget;
}

/**
 * Register a custom tool widget
 * Useful for plugin/extension system in future
 *
 * @param toolName Name of the tool
 * @param widget Widget component
 */
export function registerToolWidget(toolName: string, widget: ComponentType<ToolWidgetProps>): void {
  toolWidgetMap[toolName] = widget;
}
