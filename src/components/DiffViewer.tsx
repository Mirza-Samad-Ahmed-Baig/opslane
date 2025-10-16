import { useState } from 'react';
import { FileText, ChevronDown, ChevronRight, Plus, Minus } from 'lucide-react';
import { useSessionChanges } from '@/hooks/useSessionChanges';
import { cn } from '@/lib/utils';

interface DiffViewerProps {
  sessionId: string;
}

/**
 * DiffViewer - Right panel showing file changes with diffs
 * Polls for changes every 3 seconds and displays them with syntax highlighting
 */
export function DiffViewer({ sessionId }: DiffViewerProps) {
  const { data: changes = [], isLoading } = useSessionChanges(sessionId);
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set());

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
                    <div className="ml-6 mt-1 p-2 bg-muted/50 rounded text-xs font-mono overflow-x-auto">
                      {change.diff.split('\n').map((line, i) => (
                        <div
                          key={i}
                          className={cn(
                            'whitespace-pre',
                            line.startsWith('+') &&
                              !line.startsWith('+++') &&
                              'text-green-600 bg-green-500/10',
                            line.startsWith('-') &&
                              !line.startsWith('---') &&
                              'text-red-600 bg-red-500/10'
                          )}
                        >
                          {line}
                        </div>
                      ))}
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
