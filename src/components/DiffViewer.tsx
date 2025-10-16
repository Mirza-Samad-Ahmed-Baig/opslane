interface DiffViewerProps {
  sessionId: string;
}

/**
 * DiffViewer - Right panel for viewing file changes and diffs
 * Phase 1: Placeholder component for layout testing
 */
export function DiffViewer({ sessionId }: DiffViewerProps) {
  return (
    <div className="border-l bg-muted/30 p-4">
      <h2 className="text-sm font-semibold mb-4">Changes</h2>
      <p className="text-xs text-muted-foreground">Diff viewer panel</p>
      <p className="text-xs text-muted-foreground mt-2">Session: {sessionId}</p>
    </div>
  );
}
