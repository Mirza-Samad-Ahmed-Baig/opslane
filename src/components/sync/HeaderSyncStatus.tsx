import { useMemo } from 'react';
import { Circle, XCircle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useActiveSync } from '@/hooks/useActiveSync';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';

interface HeaderSyncStatusProps {
  projectId: string;
}

/**
 * Header sync status badge - only visible when sync is active
 * Design Principle #10: Calm Technology - appears/disappears based on state
 * Design Principle #11: Escape Hatch - quick access to Stop button
 */
export function HeaderSyncStatus({ projectId }: HeaderSyncStatusProps) {
  const { syncState, stopSync, loading } = useActiveSync(projectId);

  // Memoize duration calculation to prevent unnecessary recalculations
  // Must be called before early return to maintain consistent hook order
  const duration = useMemo(() => {
    const startedAt = syncState?.started_at ? new Date(syncState.started_at) : new Date();
    return formatDistanceToNow(startedAt, { addSuffix: false });
  }, [syncState?.started_at]);

  // Don't render anything if sync is not active (Calm Technology)
  if (!syncState?.is_active) {
    return null;
  }

  return (
    <div
      className={cn(
        'inline-flex items-center gap-2 px-3 py-1.5 rounded-full',
        'bg-amber-50 dark:bg-amber-950/30',
        'border border-amber-300 dark:border-amber-700',
        'transition-all duration-200',
        'animate-fadeIn'
      )}
      role="status"
      aria-label="Sync status"
    >
      {/* Status indicator with pulse animation */}
      <Circle
        className="w-2 h-2 fill-amber-600 dark:fill-amber-400 animate-pulse flex-shrink-0"
        aria-hidden="true"
      />

      {/* Session info */}
      <div className="flex items-center gap-1.5 min-w-0 max-w-xs lg:max-w-md">
        <span
          className="text-xs font-medium text-amber-900 dark:text-amber-200 truncate"
          title={syncState.active_session_name || syncState.active_session_id}
        >
          Syncing: {syncState.active_session_name || syncState.active_session_id}
        </span>
        <span className="text-xs text-amber-800 dark:text-amber-300 whitespace-nowrap hidden sm:inline">
          ({duration})
        </span>
      </div>

      {/* Stop button (Principle #11: Escape Hatch) */}
      <Button
        variant="ghost"
        size="sm"
        onClick={stopSync}
        disabled={loading}
        className={cn(
          'h-6 px-2 text-xs font-medium gap-1',
          'text-amber-800 hover:text-amber-900 hover:bg-amber-100',
          'dark:text-amber-300 dark:hover:text-amber-100 dark:hover:bg-amber-900/50'
        )}
        aria-label="Stop all file syncing"
        title="Stop syncing files to the container"
      >
        {loading ? (
          <>
            <Loader2 className="w-3 h-3 animate-spin" aria-hidden="true" />
            <span>Stopping...</span>
          </>
        ) : (
          <>
            <XCircle className="w-3 h-3" aria-hidden="true" />
            <span>Stop</span>
          </>
        )}
      </Button>
    </div>
  );
}
