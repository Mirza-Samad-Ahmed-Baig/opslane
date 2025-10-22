import { useState, useMemo, memo } from 'react';
import { FileText, ChevronDown, ChevronRight, Plus, Minus } from 'lucide-react';
import { useSessionChanges } from '@/hooks/useSessionChanges';
import { cn } from '@/lib/utils';
import ReactDiffViewer from 'react-diff-viewer-continued';
import { parseDiff } from '@/lib/diffParser';
import { useTheme } from 'next-themes';

interface FileChange {
  path: string;
  status: string;
  additions: number;
  deletions: number;
  diff: string;
}

interface DiffViewerProps {
  sessionId: string;
}

// Styles object (constant to avoid recreation) - GitHub-like clean styling
const diffViewerStyles = {
  variables: {
    dark: {
      diffViewerBackground: '#0d1117',
      diffViewerColor: '#c9d1d9',
      addedBackground: '#1a4d2e',
      addedColor: '#57ab5a',
      removedBackground: '#5d1f1f',
      removedColor: '#f88080',
      wordAddedBackground: '#1a4d2e',
      wordRemovedBackground: '#5d1f1f',
      addedGutterBackground: '#1a4d2e',
      removedGutterBackground: '#5d1f1f',
      gutterBackground: '#161b22',
      gutterColor: '#6e7681',
      gutterBackgroundDark: '#0d1117',
      highlightBackground: '#1f2937',
      highlightGutterBackground: '#1f2937',
    },
    light: {
      diffViewerBackground: '#ffffff',
      diffViewerColor: '#24292f',
      addedBackground: '#d1f4e0',
      addedColor: '#1a7f37',
      removedBackground: '#ffdddd',
      removedColor: '#cf222e',
      wordAddedBackground: '#acf2bd',
      wordRemovedBackground: '#ffbaba',
      addedGutterBackground: '#d1f4e0',
      removedGutterBackground: '#ffdddd',
      gutterBackground: '#f6f8fa',
      gutterColor: '#57606a',
      gutterBackgroundDark: '#f0f3f6',
      highlightBackground: '#fff8c5',
      highlightGutterBackground: '#fff8c5',
    },
  },
  diffContainer: {
    fontSize: '0.75rem',
    lineHeight: '1.5',
    fontFamily:
      'ui-monospace, SFMono-Regular, SF Mono, Menlo, Consolas, Liberation Mono, monospace',
  },
  line: {
    padding: '0 0.5rem',
    wordBreak: 'break-all' as const,
  },
};

// Memoized single file diff component
const FileDiffView = memo(
  ({ change, isDark }: { change: FileChange; isDark: boolean }) => {
    // Parse diff once and memoize
    const { oldValue, newValue } = useMemo(() => parseDiff(change.diff), [change.diff]);

    if (change.diff.startsWith('Binary file') || change.diff.startsWith('Diff too large')) {
      return (
        <div className="p-4 text-xs text-muted-foreground bg-muted/50 rounded">{change.diff}</div>
      );
    }

    return (
      <ReactDiffViewer
        oldValue={oldValue}
        newValue={newValue}
        splitView={false}
        useDarkTheme={isDark}
        hideLineNumbers={false}
        showDiffOnly={true}
        disableWordDiff={true}
        compareMethod="diffLines"
        styles={diffViewerStyles}
      />
    );
  },
  (prevProps, nextProps) => {
    // Custom comparison: only re-render if diff or theme changed
    return prevProps.change.diff === nextProps.change.diff && prevProps.isDark === nextProps.isDark;
  }
);

FileDiffView.displayName = 'FileDiffView';

/**
 * DiffViewer - Right panel showing file changes with diffs
 * Polls for changes every 3 seconds and displays them with syntax highlighting
 */
export function DiffViewer({ sessionId }: DiffViewerProps) {
  const { data: changes = [], isLoading } = useSessionChanges(sessionId);
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set());
  const { theme } = useTheme();

  const toggleFile = (path: string) => {
    setExpandedFiles((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  };

  const totalAdditions = changes.reduce((sum, c) => sum + c.additions, 0);
  const totalDeletions = changes.reduce((sum, c) => sum + c.deletions, 0);

  return (
    <div className="flex flex-col h-full border-l bg-muted/30">
      {/* Header */}
      <div className="p-4 border-b">
        <h2 className="text-sm font-semibold mb-2">Changes</h2>
        {changes.length > 0 && (
          <div className="flex gap-3 text-xs">
            <span className="flex items-center gap-1 text-green-600">
              <Plus className="h-3 w-3" />
              {totalAdditions}
            </span>
            <span className="flex items-center gap-1 text-red-600">
              <Minus className="h-3 w-3" />
              {totalDeletions}
            </span>
          </div>
        )}
      </div>

      {/* File list */}
      <div className="flex-1 overflow-auto">
        {isLoading ? (
          <div className="p-4 text-xs text-muted-foreground">Loading changes...</div>
        ) : changes.length === 0 ? (
          <div className="p-4 text-xs text-muted-foreground">No changes yet</div>
        ) : (
          <div className="p-2 space-y-1">
            {changes.map((change) => {
              const isExpanded = expandedFiles.has(change.path);

              return (
                <div key={change.path}>
                  <button
                    type="button"
                    onClick={() => toggleFile(change.path)}
                    className="flex items-center gap-2 p-2 rounded hover:bg-muted focus:bg-muted cursor-pointer w-full text-left focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-1"
                    aria-expanded={isExpanded}
                    aria-label={`${isExpanded ? 'Collapse' : 'Expand'} diff for ${change.path}`}
                  >
                    {isExpanded ? (
                      <ChevronDown className="h-3 w-3" />
                    ) : (
                      <ChevronRight className="h-3 w-3" />
                    )}

                    <FileText className="h-4 w-4" />

                    <span className="text-sm flex-1 truncate">{change.path}</span>

                    <span
                      className={cn(
                        'text-xs px-1.5 py-0.5 rounded',
                        change.status === 'added' && 'bg-green-500/20 text-green-600',
                        change.status === 'modified' && 'bg-yellow-500/20 text-yellow-600',
                        change.status === 'deleted' && 'bg-red-500/20 text-red-600'
                      )}
                    >
                      {change.status[0]?.toUpperCase()}
                    </span>
                  </button>

                  {isExpanded && (
                    <div className="ml-6 mt-1 rounded overflow-hidden max-h-96 overflow-y-auto">
                      <FileDiffView change={change} isDark={theme === 'dark'} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
