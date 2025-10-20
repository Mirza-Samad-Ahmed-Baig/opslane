import { ComponentType } from 'react';
import type { ToolWidgetProps } from './BaseToolWidget';
import { GenericToolWidget } from './GenericToolWidget';
// Import tool-specific widgets as they're implemented
// import { ReadToolWidget } from './ReadToolWidget';
// import { BashToolWidget } from './BashToolWidget';
// etc.

/**
 * Registry mapping tool names to their widget components
 *
 * Phase 1: All tools use GenericToolWidget fallback
 * Phase 4: Replace with tool-specific widgets
 */
const toolWidgetMap: Record<string, ComponentType<ToolWidgetProps>> = {
  // Phase 4: Uncomment as widgets are implemented
  // Read: ReadToolWidget,
  // Bash: BashToolWidget,
  // Edit: EditToolWidget,
  // Task: TaskToolWidget,
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
