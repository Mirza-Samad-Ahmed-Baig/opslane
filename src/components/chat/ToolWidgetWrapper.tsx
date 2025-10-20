import { useState, useCallback } from 'react';
import { getToolWidget } from './tools/ToolWidgetRegistry';
import type { ToolExecution } from '@/types/messages';

interface ToolWidgetWrapperProps {
  tool: ToolExecution;
}

/**
 * Wrapper component for individual tool widgets
 * Manages local expand/collapse state (Phase 2 will move this to group level)
 */
export function ToolWidgetWrapper({ tool }: ToolWidgetWrapperProps) {
  const ToolWidget = getToolWidget(tool.name);
  const [isExpanded, setIsExpanded] = useState(tool.expanded);

  const handleToggle = useCallback(() => {
    setIsExpanded((prev) => !prev);
  }, []);

  return <ToolWidget tool={tool} isExpanded={isExpanded} onToggle={handleToggle} />;
}
