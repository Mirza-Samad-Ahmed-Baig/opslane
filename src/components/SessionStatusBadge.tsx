import type { SessionStatus } from '@/types';
import { cn } from '@/lib/utils';

interface SessionStatusBadgeProps {
  status: SessionStatus;
}

const statusConfig: Record<SessionStatus, { label: string; className: string }> = {
  created: {
    label: 'Creating',
    className: 'bg-status-info-bg text-status-info-fg border-status-info-border',
  },
  cloning: {
    label: 'Cloning',
    className: 'bg-status-warning-bg text-status-warning-fg border-status-warning-border',
  },
  ready: {
    label: 'Ready',
    className: 'bg-status-success-bg text-status-success-fg border-status-success-border',
  },
  error: {
    label: 'Error',
    className: 'bg-status-error-bg text-status-error-fg border-status-error-border',
  },
};

/**
 * SessionStatusBadge - Displays a color-coded status badge for a session
 *
 * @param status - Current status of the session (created, cloning, ready, or error)
 *
 * Features:
 * - Color-coded badges: blue (creating), yellow (cloning), green (ready), red (error)
 * - Consistent styling with rounded corners and borders
 */
export function SessionStatusBadge({ status }: SessionStatusBadgeProps) {
  const config = statusConfig[status];

  return (
    <span
      className={cn(
        'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border',
        config.className
      )}
    >
      {config.label}
    </span>
  );
}
