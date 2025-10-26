/**
 * DEPRECATED: This component has been replaced by HeaderSyncStatus
 * The fixed bottom bar was removed to improve UX (avoid overlap with chat input)
 * See: thoughts/shared/plans/2025-10-26-improve-sync-status-ux.md
 *
 * Kept for reference only - do not use in new code
 */

import { Circle, XCircle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useActiveSync } from '@/hooks/useActiveSync';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';

interface GlobalSyncStatusProps {
  projectId: string;
}

/**
 * @deprecated Use HeaderSyncStatus instead
 * Global sync status bar - always visible at bottom
 * Design Principle #4: Transparent State - Always show sync status clearly
 * Design Principle #10: Calm Technology - Subtle but persistent indicators
 */
export function GlobalSyncStatus({ projectId }: GlobalSyncStatusProps) {
  const { syncState, stopSync, loading } = useActiveSync(projectId);

  // No sync - calm, unobtrusive (Principle #10)
  if (!syncState?.is_active) {
    return (
      <div className="fixed bottom-0 left-0 right-0 h-7 bg-muted/50 border-t flex items-center px-4 z-50">
        <Circle className="w-2 h-2 fill-gray-400 mr-2" />
        <span className="text-xs text-muted-foreground">
          No active sync • Local changes are private
        </span>
      </div>
    );
  }

  // Active sync - noticeable but not alarming (Principles #4, #10)
  const startedAt = syncState.started_at ? new Date(syncState.started_at) : new Date();
  const duration = formatDistanceToNow(startedAt, { addSuffix: false });

  return (
    <div
      className={cn(
        'fixed bottom-0 left-0 right-0 h-7 border-t flex items-center justify-between px-4 z-50',
        'bg-amber-50 dark:bg-amber-950/30 border-amber-300 dark:border-amber-700'
      )}
    >
      <div className="flex items-center gap-2">
        {/* Subtle pulse animation (Principle #10: Calm Technology) */}
        <Circle className="w-2 h-2 fill-amber-600 dark:fill-amber-400 animate-pulse" />
        <span className="text-xs font-medium text-amber-900 dark:text-amber-200">
          Syncing local → {syncState.active_session_id}
        </span>
        <span className="text-xs text-amber-800 dark:text-amber-300">({duration})</span>
      </div>

      {/* Always provide escape hatch (Principle #11) */}
      <Button
        variant="ghost"
        size="sm"
        onClick={stopSync}
        disabled={loading}
        className={cn(
          'text-amber-800 hover:text-amber-900',
          'dark:text-amber-300 dark:hover:text-amber-100',
          'h-5 px-2 text-xs font-medium'
        )}
        aria-label="Stop all file syncing"
        title="Stop syncing files to the container"
      >
        {loading ? (
          <Loader2 className="w-3 h-3 mr-1 animate-spin" />
        ) : (
          <XCircle className="w-3 h-3 mr-1" />
        )}
        {loading ? 'Stopping...' : 'Stop'}
      </Button>
    </div>
  );
}
