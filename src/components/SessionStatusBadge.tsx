import type { SessionStatus } from '@/types';
import { cn } from '@/lib/utils';

interface SessionStatusBadgeProps {
  status: SessionStatus;
}

const statusConfig: Record<SessionStatus, { label: string; className: string }> = {
  created: {
    label: 'Creating',
    className: 'bg-blue-100 text-blue-800 border-blue-200',
  },
  cloning: {
    label: 'Cloning',
    className: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  },
  ready: {
    label: 'Ready',
    className: 'bg-green-100 text-green-800 border-green-200',
  },
  error: {
    label: 'Error',
    className: 'bg-red-100 text-red-800 border-red-200',
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
