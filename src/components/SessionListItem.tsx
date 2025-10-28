import { useNavigate } from 'react-router-dom';
import { Archive } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatRelativeTime } from '@/utils/timeFormat';
import { useArchiveSession } from '@/hooks/useSessions';
import type { Session } from '@/types/session';
import type { Project } from '@/types/project';

interface SessionListItemProps {
  session: Session;
  project: Project;
  isActive?: boolean;
}

/**
 * Status dot color mapping using design system tokens
 * Maps to the same semantic colors as SessionStatusBadge
 */
const STATUS_DOT_COLORS: Record<Session['status'], string> = {
  created: 'bg-[var(--status-info-fg)]', // Blue - creating/info
  cloning: 'bg-[var(--status-warning-fg)]', // Yellow - in progress
  ready: 'bg-[var(--status-success-fg)]', // Green - success
  error: 'bg-[var(--status-error-fg)]', // Red - error
};

export function SessionListItem({ session, project, isActive = false }: SessionListItemProps) {
  const navigate = useNavigate();
  const archiveSession = useArchiveSession();

  const handleClick = () => {
    navigate(`/session/${session.id}`);
  };

  const handleArchive = (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent navigation when clicking archive button
    if (!archiveSession.isPending) {
      archiveSession.mutate(session.id);
    }
  };

  const statusColor = STATUS_DOT_COLORS[session.status];
  const title = session.name || 'Untitled Session';
  const timestamp = formatRelativeTime(session.created_at);

  // Subtitle: project • timestamp
  const subtitle = `${project.name} • ${timestamp}`;

  return (
    <button
      onClick={handleClick}
      className={cn(
        'group flex items-start gap-3 px-4 py-3 w-full text-left transition-colors',
        'hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        isActive && 'bg-accent/80 border-l-4 border-primary shadow-sm font-medium'
      )}
      aria-label={`Session: ${title}`}
      aria-current={isActive ? 'page' : undefined}
    >
      {/* Status Dot */}
      <div
        className={cn('w-2 h-2 rounded-full mt-2 shrink-0', statusColor)}
        aria-label={`Status: ${session.status}`}
      />

      {/* Content */}
      <div className="flex-1 min-w-0">
        {/* Title */}
        <div className="text-sm font-medium truncate text-foreground" title={title}>
          {title}
        </div>

        {/* Subtitle: project • timestamp */}
        <div className="text-xs text-muted-foreground truncate mt-0.5" title={subtitle}>
          {subtitle}
        </div>
      </div>

      {/* Archive Button - shown on hover */}
      <button
        onClick={handleArchive}
        disabled={archiveSession.isPending}
        className={cn(
          'opacity-0 group-hover:opacity-100 p-1.5 rounded hover:bg-muted transition-opacity',
          'focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring',
          'disabled:cursor-not-allowed disabled:opacity-50',
          archiveSession.isPending && 'opacity-100 animate-pulse'
        )}
        aria-label={archiveSession.isPending ? 'Archiving...' : 'Archive session'}
        title={archiveSession.isPending ? 'Archiving...' : 'Archive session'}
      >
        <Archive
          className={cn(
            'w-4 h-4 text-muted-foreground',
            archiveSession.isPending && 'animate-spin'
          )}
        />
      </button>
    </button>
  );
}
