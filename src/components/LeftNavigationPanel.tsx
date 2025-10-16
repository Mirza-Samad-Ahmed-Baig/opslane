interface LeftNavigationPanelProps {
  sessionId: string;
}

/**
 * LeftNavigationPanel - Left sidebar for projects and tasks hierarchy
 * Phase 1: Placeholder component for layout testing
 */
export function LeftNavigationPanel({ sessionId }: LeftNavigationPanelProps) {
  return (
    <div className="border-r bg-muted/30 p-4">
      <h2 className="text-sm font-semibold mb-4">Projects</h2>
      <p className="text-xs text-muted-foreground">Left navigation panel</p>
      <p className="text-xs text-muted-foreground mt-2">Session: {sessionId}</p>
    </div>
  );
}
