import type { ToolWidgetProps } from './BaseToolWidget';
import { ToolWidgetUtils } from './BaseToolWidget';
import {
  ChevronRight,
  Edit3,
  CheckCircle,
  XCircle,
  Plus,
  Minus,
  AlertCircle,
  Copy,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useCopyToClipboard } from '@/hooks/useCopyToClipboard';

/**
 * Widget for Edit tool - displays file path and change summary
 */
export function EditToolWidget({ tool, isExpanded, onToggle }: ToolWidgetProps) {
  const { file_path, old_string, new_string } = tool.input as {
    file_path: string;
    old_string: string;
    new_string: string;
  };

  const result = tool.result?.content;
  const isError = tool.result?.isError ?? false;

  // Calculate simple diff stats
  const oldLines = old_string.split('\n').length;
  const newLines = new_string.split('\n').length;
  const addedLines = Math.max(0, newLines - oldLines);
  const removedLines = Math.max(0, oldLines - newLines);

  // Copy functionality for diff
  const { copied, copy } = useCopyToClipboard();
  const handleCopyDiff = () => {
    const diff = `--- ${file_path}\n${old_string}\n\n+++ ${file_path}\n${new_string}`;
    copy(diff);
  };

  return (
    <div className="border-muted bg-muted/30 rounded-lg">
      {/* Header */}
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-2 p-3 hover:bg-black/5 dark:hover:bg-white/5 transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-lg"
        aria-expanded={isExpanded}
        aria-label={`${isExpanded ? 'Collapse' : 'Expand'} Edit tool - ${file_path}`}
      >
        <ChevronRight
          className={cn(
            'h-4 w-4 text-muted-foreground transition-transform duration-200',
            isExpanded && 'rotate-90'
          )}
        />
        <Edit3 className="h-4 w-4 text-purple-400" />
        <span className="font-mono text-sm font-medium">Edit</span>
        <span className="text-xs text-muted-foreground font-mono truncate max-w-md">
          {ToolWidgetUtils.truncatePath(file_path, 50)}
        </span>

        {/* Change summary */}
        <div className="flex items-center gap-2 text-xs ml-auto">
          {addedLines > 0 && (
            <span className="text-green-600 dark:text-green-400 flex items-center gap-0.5">
              <Plus className="h-3 w-3" />
              {addedLines}
            </span>
          )}
          {removedLines > 0 && (
            <span className="text-red-600 dark:text-red-400 flex items-center gap-0.5">
              <Minus className="h-3 w-3" />
              {removedLines}
            </span>
          )}

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
          {/* File info */}
          <div className="text-xs">
            <div className="text-muted-foreground mb-2">
              <span className="font-medium">File:</span>{' '}
              <code className="font-mono bg-muted px-1 rounded">{file_path}</code>
            </div>
          </div>

          {/* Diff view */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="text-xs text-muted-foreground">Changes:</div>
              <button
                onClick={handleCopyDiff}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                aria-label="Copy diff"
              >
                <Copy className="h-3 w-3" />
                {copied ? 'Copied!' : 'Copy'}
              </button>
            </div>

            {/* Removed lines */}
            {old_string && (
              <div className="bg-red-950/20 border-l-2 border-red-500 pl-3 py-2 mb-2">
                <div className="text-xs text-red-400 font-mono whitespace-pre-wrap">
                  {old_string.split('\n').map((line, i) => (
                    <div key={`old-${i}`} className="flex items-start gap-2">
                      <Minus className="h-3 w-3 mt-0.5 shrink-0" />
                      <span>{line}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Added lines */}
            {new_string && (
              <div className="bg-green-950/20 border-l-2 border-green-500 pl-3 py-2">
                <div className="text-xs text-green-400 font-mono whitespace-pre-wrap">
                  {new_string.split('\n').map((line, i) => (
                    <div key={`new-${i}`} className="flex items-start gap-2">
                      <Plus className="h-3 w-3 mt-0.5 shrink-0" />
                      <span>{line}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Error state */}
          {isError && result && (
            <div className="bg-destructive/10 border border-destructive/20 rounded p-3">
              <div className="text-xs font-medium text-destructive mb-1">Error:</div>
              <div className="text-xs text-destructive/90 font-mono whitespace-pre-wrap">
                {result}
              </div>
            </div>
          )}

          {/* Success message */}
          {!isError && result && <div className="text-xs text-status-success-fg">✓ {result}</div>}
        </div>
      )}
    </div>
  );
}
