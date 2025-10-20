import { useCallback, useMemo } from 'react';
import { ChevronRight, Package } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ToolExecution } from '@/types/messages';
import { getToolWidget } from './tools/ToolWidgetRegistry';

interface ToolMessageGroupProps {
  tools: ToolExecution[];
  messageId: string;
  isGroupCollapsed: (groupId: string) => boolean;
  isToolCollapsed: (toolId: string) => boolean;
  onGroupToggle: (groupId: string, currentlyCollapsed: boolean) => void;
  onToolToggle: (toolId: string, currentlyCollapsed: boolean) => void;
}

/**
 * Group of consecutive tool calls with collapse/expand
 *
 * Behavior:
 * - Single tool: Render directly without group wrapper
 * - Multiple tools: Show group header with summary
 */
export function ToolMessageGroup({
  tools,
  messageId,
  isGroupCollapsed,
  isToolCollapsed,
  onGroupToggle,
  onToolToggle,
}: ToolMessageGroupProps) {
  const groupId = `tool-group-${messageId}`;
  const isExpanded = !isGroupCollapsed(groupId);

  const handleGroupToggle = useCallback(() => {
    onGroupToggle(groupId, !isExpanded);
  }, [groupId, isExpanded, onGroupToggle]);

  const handleToolToggle = useCallback(
    (toolId: string) => {
      const currentlyCollapsed = isToolCollapsed(toolId);
      onToolToggle(toolId, currentlyCollapsed);
    },
    [isToolCollapsed, onToolToggle]
  );

  // Generate tool summary for group header
  const toolSummary = useMemo(() => {
    const toolNames = tools.map((t) => t.name);
    const uniqueNames = Array.from(new Set(toolNames));

    if (uniqueNames.length <= 3) {
      return uniqueNames.join(', ');
    }

    return `${uniqueNames.slice(0, 3).join(', ')} and ${uniqueNames.length - 3} more`;
  }, [tools]);

  // Single tool: render directly without group wrapper
  if (tools.length === 1) {
    const tool = tools[0];
    if (!tool) {
      console.warn('[ToolMessageGroup] Tool is undefined in single tool rendering');
      return null; // Safety check
    }

    const ToolWidget = getToolWidget(tool.name);
    // Default to collapsed (true) for progressive disclosure
    const toolIsExpanded = !isToolCollapsed(tool.id);

    return (
      <ToolWidget
        tool={tool}
        isExpanded={toolIsExpanded}
        onToggle={() => handleToolToggle(tool.id)}
      />
    );
  }

  // Multiple tools: show group header + collapsible list
  return (
    <div className="border-l-2 border-primary/30 bg-muted/40 rounded-lg">
      {/* Group header */}
      <button
        onClick={handleGroupToggle}
        className="w-full flex items-center gap-2 p-3 hover:bg-black/10 dark:hover:bg-white/10 transition-colors duration-200"
        aria-expanded={isExpanded}
        aria-label={`${isExpanded ? 'Collapse' : 'Expand'} group of ${tools.length} tools`}
      >
        <ChevronRight
          className={cn(
            'h-4 w-4 text-muted-foreground transition-transform duration-200',
            isExpanded && 'rotate-90'
          )}
        />
        <Package className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-medium">{tools.length} tools executed</span>
        <span className="text-xs text-muted-foreground">({toolSummary})</span>
      </button>

      {/* Tool list (when group expanded) */}
      {isExpanded && (
        <div className="px-3 pb-3 space-y-2">
          {tools.map((tool) => {
            const ToolWidget = getToolWidget(tool.name);
            // Default to collapsed (true) for progressive disclosure
            const toolIsExpanded = !isToolCollapsed(tool.id);

            return (
              <ToolWidget
                key={tool.id}
                tool={tool}
                isExpanded={toolIsExpanded}
                onToggle={() => handleToolToggle(tool.id)}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
