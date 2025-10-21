import type { ToolWidgetProps } from './BaseToolWidget';
import { ToolWidgetUtils } from './BaseToolWidget';
import { ChevronRight, FileText, CheckCircle, XCircle, Copy, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { useCopyToClipboard } from '@/hooks/useCopyToClipboard';

/**
 * Widget for Read tool - displays file path, line range, and syntax-highlighted content
 */
export function ReadToolWidget({ tool, isExpanded, onToggle }: ToolWidgetProps) {
  const { file_path, limit, offset } = tool.input as {
    file_path: string;
    limit?: number;
    offset?: number;
  };

  const result = tool.result?.content;
  const isError = tool.result?.isError ?? false;
  const lineCount = result ? result.split('\n').length : 0;

  // Detect language from file extension
  const getLanguage = (path: string): string => {
    const ext = path.split('.').pop()?.toLowerCase();
    const langMap: Record<string, string> = {
      ts: 'typescript',
      tsx: 'tsx',
      js: 'javascript',
      jsx: 'jsx',
      py: 'python',
      rs: 'rust',
      go: 'go',
      java: 'java',
      c: 'c',
      cpp: 'cpp',
      h: 'c',
      hpp: 'cpp',
      css: 'css',
      scss: 'scss',
      html: 'html',
      json: 'json',
      md: 'markdown',
      yml: 'yaml',
      yaml: 'yaml',
      toml: 'toml',
      sh: 'bash',
      bash: 'bash',
      sql: 'sql',
    };
    return langMap[ext || ''] || 'text';
  };

  const { copied, copy } = useCopyToClipboard();

  return (
    <div className="border-muted bg-muted/30 rounded-lg">
      {/* Header */}
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-2 p-3 hover:bg-black/5 dark:hover:bg-white/5 transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-lg"
        aria-expanded={isExpanded}
        aria-label={`${isExpanded ? 'Collapse' : 'Expand'} Read tool - ${file_path}`}
      >
        <ChevronRight
          className={cn(
            'h-4 w-4 text-muted-foreground transition-transform duration-200',
            isExpanded && 'rotate-90'
          )}
        />
        <FileText className="h-4 w-4 text-blue-500" />
        <span className="font-mono text-sm font-medium">Read</span>
        <span className="text-xs text-muted-foreground font-mono truncate max-w-md">
          {ToolWidgetUtils.truncatePath(file_path, 60)}
        </span>

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
          {/* Parameters */}
          <div className="text-xs space-y-1">
            <div className="text-muted-foreground">
              <span className="font-medium">File:</span>{' '}
              <code className="font-mono bg-muted px-1 rounded">{file_path}</code>
            </div>
            {(limit !== undefined || offset !== undefined) && (
              <div className="text-muted-foreground">
                <span className="font-medium">Lines:</span> {offset || 0} -{' '}
                {(offset || 0) + (limit || lineCount)}
              </div>
            )}
          </div>

          {/* Result */}
          {result && !isError && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="text-xs text-muted-foreground">
                  {lineCount} {lineCount === 1 ? 'line' : 'lines'} read
                </div>
                <button
                  onClick={() => result && copy(result)}
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                  aria-label="Copy file content"
                >
                  <Copy className="h-3 w-3" />
                  {copied ? 'Copied!' : 'Copy'}
                </button>
              </div>

              <div className="rounded overflow-hidden max-h-96 overflow-y-auto border border-muted">
                <SyntaxHighlighter
                  language={getLanguage(file_path)}
                  style={oneDark}
                  customStyle={{
                    margin: 0,
                    padding: '1rem',
                    fontSize: '0.75rem',
                    lineHeight: '1.5',
                  }}
                  showLineNumbers
                  wrapLines
                >
                  {result}
                </SyntaxHighlighter>
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
