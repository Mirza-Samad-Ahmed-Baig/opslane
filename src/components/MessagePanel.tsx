interface MessagePanelProps {
  sessionId: string;
}

/**
 * MessagePanel - Center panel for chat messages and input
 * Phase 1: Placeholder component for layout testing
 */
export function MessagePanel({ sessionId }: MessagePanelProps) {
  return (
    <div className="flex flex-col">
      <div className="flex-1 p-4">
        <h2 className="text-sm font-semibold mb-4">Messages</h2>
        <p className="text-sm text-muted-foreground">Message panel</p>
        <p className="text-xs text-muted-foreground mt-2">Session: {sessionId}</p>
      </div>
    </div>
  );
}
