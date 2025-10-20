import type { ToolWidgetProps } from './BaseToolWidget';
import { ChevronRight, Wrench, CheckCircle, XCircle, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Generic fallback widget for tools without custom renderers
 * Displays tool name, parameters (as JSON), and results
 */
export function GenericToolWidget({ tool, isExpanded, onToggle }: ToolWidgetProps) {
  const hasResult = !!tool.result;
  const isError = tool.result?.isError ?? false;

  return (
    <div className="border-muted bg-muted/30 rounded-lg">
      {/* Header (always visible) */}
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-2 p-3 hover:bg-black/5 dark:hover:bg-white/5 transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-lg"
        aria-expanded={isExpanded}
        aria-label={`${isExpanded ? 'Collapse' : 'Expand'} ${tool.name} tool details${tool.result ? (tool.result.isError ? ' - Error' : ' - Success') : ' - Pending'}`}
      >
        <ChevronRight
          className={cn(
            'h-4 w-4 text-muted-foreground transition-transform duration-200',
            isExpanded && 'rotate-90'
          )}
        />
        <Wrench className="h-4 w-4 text-muted-foreground" />
        <span className="font-mono text-sm font-medium">{tool.name}</span>

        {/* Status indicator */}
        {hasResult && (
          <div className="ml-auto flex items-center gap-1">
            {isError ? (
              <XCircle className="h-4 w-4 text-destructive" aria-label="Error" />
            ) : (
              <CheckCircle className="h-4 w-4 text-status-success-fg" aria-label="Success" />
            )}
          </div>
        )}
        {!hasResult && (
          <AlertCircle className="h-4 w-4 text-muted-foreground/70 ml-auto" aria-label="Pending" />
        )}
      </button>

      {/* Expanded content */}
      {isExpanded && (
        <div className="px-4 py-3 border-t bg-background/50 space-y-3">
          {/* Parameters */}
          {Object.keys(tool.input).length > 0 && (
            <div>
              <div className="text-xs font-medium text-muted-foreground mb-1">Parameters:</div>
              <div className="bg-muted/50 rounded p-2 font-mono text-xs overflow-x-auto">
                <pre>{JSON.stringify(tool.input, null, 2)}</pre>
              </div>
            </div>
          )}

          {/* Result - only show if there's an error (debugging aid) */}
          {hasResult && tool.result && isError && (
            <div>
              <div className="text-xs font-medium text-muted-foreground mb-1">
                <span className="text-destructive">Error:</span>
              </div>
              <div className="rounded p-2 font-mono text-xs max-h-96 overflow-y-auto bg-destructive/10 text-destructive">
                <pre className="whitespace-pre-wrap">{tool.result.content}</pre>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
