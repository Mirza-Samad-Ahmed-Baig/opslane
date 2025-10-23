import type { ToolWidgetProps } from './BaseToolWidget';
import { ChevronRight, Terminal, CheckCircle, XCircle, Copy, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useCopyToClipboard } from '@/hooks/useCopyToClipboard';

/**
 * Widget for Bash tool - displays command and terminal-style output
 */
export function BashToolWidget({ tool, isExpanded, onToggle }: ToolWidgetProps) {
  const { command, description } = tool.input as {
    command: string;
    description?: string;
  };

  const result = tool.result?.content;
  const isError = tool.result?.isError ?? false;

  const { copied, copy } = useCopyToClipboard();

  return (
    <div className="border-muted bg-muted/30 rounded-lg">
      {/* Header */}
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-2 p-3 hover:bg-black/5 dark:hover:bg-white/5 transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-lg"
        aria-expanded={isExpanded}
        aria-label={`${isExpanded ? 'Collapse' : 'Expand'} Bash tool - ${command}`}
      >
        <ChevronRight
          className={cn(
            'h-4 w-4 text-muted-foreground transition-transform duration-200',
            isExpanded && 'rotate-90'
          )}
        />
        <Terminal className="h-4 w-4 text-primary" />
        <span className="font-mono text-sm font-medium">Bash</span>
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
          {/* Command */}
          <div>
            <div className="text-xs text-muted-foreground mb-1">Command:</div>
            <div className="bg-black/90 text-green-400 rounded p-2 font-mono text-xs">
              <span className="text-green-500">$ </span>
              {command}
            </div>
          </div>

          {/* Description */}
          {description && <div className="text-xs text-muted-foreground">{description}</div>}

          {/* Output */}
          {result && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="text-xs text-muted-foreground">
                  {isError ? 'Error Output:' : 'Output:'}
                </div>
                <button
                  onClick={() => result && copy(result)}
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                  aria-label="Copy output"
                >
                  <Copy className="h-3 w-3" />
                  {copied ? 'Copied!' : 'Copy'}
                </button>
              </div>

              <div
                className={cn(
                  'rounded p-3 font-mono text-xs max-h-96 overflow-y-auto whitespace-pre-wrap',
                  isError
                    ? 'bg-red-950/20 text-red-400 border border-red-900/30'
                    : 'bg-black/90 text-green-400 border border-green-900/30'
                )}
              >
                {result}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
