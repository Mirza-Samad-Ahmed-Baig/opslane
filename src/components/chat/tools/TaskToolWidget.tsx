import type { ToolWidgetProps } from './BaseToolWidget';
import { ToolWidgetUtils } from './BaseToolWidget';
import { ChevronRight, GitBranch, CheckCircle, XCircle, AlertCircle, Copy } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useCopyToClipboard } from '@/hooks/useCopyToClipboard';

/**
 * Widget for Task tool - displays sub-agent description and result summary
 */
export function TaskToolWidget({ tool, isExpanded, onToggle }: ToolWidgetProps) {
  const { description, prompt, subagent_type } = tool.input as {
    description?: string;
    prompt: string;
    subagent_type?: string;
  };

  const result = tool.result?.content;
  const isError = tool.result?.isError ?? false;

  // Copy functionality for result
  const { copied, copy } = useCopyToClipboard();

  return (
    <div className="border-muted bg-muted/30 rounded-lg">
      {/* Header */}
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-2 p-3 hover:bg-black/5 dark:hover:bg-white/5 transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-lg"
        aria-expanded={isExpanded}
        aria-label={`${isExpanded ? 'Collapse' : 'Expand'} Task tool - ${description || 'Sub-agent'}`}
      >
        <ChevronRight
          className={cn(
            'h-4 w-4 text-muted-foreground transition-transform duration-200',
            isExpanded && 'rotate-90'
          )}
        />
        <GitBranch className="h-4 w-4 text-orange-500" />
        <span className="font-mono text-sm font-medium">Task</span>
        {description && (
          <span className="text-xs text-muted-foreground truncate max-w-sm">{description}</span>
        )}

        <div className="ml-auto">
          {tool.result ? (
            isError ? (
              <XCircle className="h-3 w-3 text-destructive" aria-label="Error" />
            ) : (
              <CheckCircle className="h-3 w-3 text-status-success-fg" aria-label="Success" />
            )
          ) : (
            <AlertCircle className="h-3 w-3 text-muted-foreground/70" aria-label="Pending" />
          )}
        </div>
      </button>

      {/* Expanded content */}
      {isExpanded && (
        <div className="px-4 py-3 border-t bg-background/50 space-y-3">
          {/* Agent type */}
          {subagent_type && (
            <div className="text-xs">
              <span className="text-muted-foreground font-medium">Agent Type:</span>{' '}
              <code className="font-mono bg-muted px-1 rounded">{subagent_type}</code>
            </div>
          )}

          {/* Description */}
          {description && (
            <div className="text-xs">
              <span className="text-muted-foreground font-medium">Description:</span> {description}
            </div>
          )}

          {/* Prompt preview */}
          <div>
            <div className="text-xs text-muted-foreground mb-1">Prompt:</div>
            <div className="bg-muted/50 rounded p-2 text-xs max-h-32 overflow-y-auto">
              {ToolWidgetUtils.truncateText(prompt, 500)}
            </div>
          </div>

          {/* Result summary */}
          {result && !isError && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="text-xs text-muted-foreground">Result:</div>
                <button
                  onClick={() => copy(result)}
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                  aria-label="Copy result"
                >
                  <Copy className="h-3 w-3" />
                  {copied ? 'Copied!' : 'Copy'}
                </button>
              </div>
              <div className="bg-muted/50 rounded p-2 text-xs max-h-64 overflow-y-auto whitespace-pre-wrap">
                {result}
              </div>
            </div>
          )}

          {/* Error state */}
          {isError && result && (
            <div className="bg-destructive/10 border border-destructive/20 rounded p-3">
              <div className="text-xs font-medium text-destructive mb-1">Error:</div>
              <div className="text-xs text-destructive/90 font-mono whitespace-pre-wrap">
                {result}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
