import { useState, useCallback, useMemo } from 'react';
import { ChevronRight, Package } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ToolExecution } from '@/types/messages';
import { getToolWidget } from './tools/ToolWidgetRegistry';

interface ToolMessageGroupProps {
  tools: ToolExecution[];
  messageId: string; // Used in Phase 3 for collapse state persistence
  defaultCollapsed?: boolean;
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
  messageId: _messageId, // Reserved for Phase 3 collapse state
  defaultCollapsed = false,
}: ToolMessageGroupProps) {
  void _messageId; // Suppress unused warning - will be used in Phase 3
  const [isGroupExpanded, setIsGroupExpanded] = useState(!defaultCollapsed);
  const [expandedToolIds, setExpandedToolIds] = useState<Set<string>>(new Set());

  const handleGroupToggle = useCallback(() => {
    setIsGroupExpanded((prev) => !prev);
  }, []);

  const handleToolToggle = useCallback((toolId: string) => {
    setExpandedToolIds((prev) => {
      const next = new Set(prev);
      if (next.has(toolId)) {
        next.delete(toolId);
      } else {
        next.add(toolId);
      }
      return next;
    });
  }, []);

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
    const isExpanded = expandedToolIds.has(tool.id);

    return (
      <ToolWidget tool={tool} isExpanded={isExpanded} onToggle={() => handleToolToggle(tool.id)} />
    );
  }

  // Multiple tools: show group header + collapsible list
  return (
    <div className="border-l-2 border-primary/30 bg-muted/40 rounded-lg">
      {/* Group header */}
      <button
        onClick={handleGroupToggle}
        className="w-full flex items-center gap-2 p-3 hover:bg-black/10 dark:hover:bg-white/10 transition-colors duration-200"
        aria-expanded={isGroupExpanded}
        aria-label={`${isGroupExpanded ? 'Collapse' : 'Expand'} group of ${tools.length} tools`}
      >
        <ChevronRight
          className={cn(
            'h-4 w-4 text-muted-foreground transition-transform duration-200',
            isGroupExpanded && 'rotate-90'
          )}
        />
        <Package className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-medium">{tools.length} tools executed</span>
        <span className="text-xs text-muted-foreground">({toolSummary})</span>
      </button>

      {/* Tool list (when group expanded) */}
      {isGroupExpanded && (
        <div className="px-3 pb-3 space-y-2">
          {tools.map((tool) => {
            const ToolWidget = getToolWidget(tool.name);
            const isExpanded = expandedToolIds.has(tool.id);

            return (
              <ToolWidget
                key={tool.id}
                tool={tool}
                isExpanded={isExpanded}
                onToggle={() => handleToolToggle(tool.id)}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
