import { useNavigate } from 'react-router-dom';
import { Loader2, FolderOpen, Circle } from 'lucide-react';
import { useSessions } from '@/hooks';
import { cn } from '@/lib/utils';

interface SessionListProps {
  onCreateClick: () => void;
  activeSessionId?: string;
}

/**
 * SessionList - Left navigation showing sessions grouped by projects
 *
 * @param onCreateClick - Callback function to open the new session dialog
 *
 * Features:
 * - Compact list format for left navigation
 * - Project-based grouping (currently shows "Recent Sessions")
 * - Status indicators with color-coded dots
 * - Click to navigate to session detail
 * - Auto-refresh every 5 seconds via React Query
 */
export function SessionList({ onCreateClick, activeSessionId }: SessionListProps) {
  const navigate = useNavigate();
  const { data: sessions, isLoading } = useSessions();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!sessions || sessions.length === 0) {
    return (
      <div className="p-4">
        <p className="text-xs text-muted-foreground mb-3">No sessions yet</p>
        <button onClick={onCreateClick} className="text-xs text-primary hover:underline">
          Create your first session
        </button>
      </div>
    );
  }

  // Group sessions by project
  // For now, we'll show all sessions in a "Recent" project
  // TODO: Add actual project grouping when projects are implemented
  const projectGroups = [
    {
      name: 'Recent Sessions',
      sessions: sessions.slice(0, 10), // Show last 10 sessions
    },
  ];

  return (
    <div className="border-r bg-muted/30">
      <div className="py-2">
        {projectGroups.map((project) => (
          <div key={project.name} className="mb-4">
            {/* Project Header */}
            <div className="px-3 py-2 flex items-center gap-2">
              <FolderOpen className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">{project.name}</span>
            </div>

            {/* Sessions in this project */}
            <div className="space-y-1">
              {project.sessions.map((session) => (
                <button
                  key={session.id}
                  onClick={() => navigate(`/session/${session.id}`)}
                  className={cn(
                    'w-full px-3 py-2 flex items-center gap-2 hover:bg-muted/50 transition-colors text-left',
                    'group',
                    activeSessionId === session.id && 'bg-muted'
                  )}
                >
                  <Circle
                    className={cn(
                      'h-2 w-2 flex-shrink-0',
                      session.status === 'ready' && 'fill-green-500 text-green-500',
                      session.status === 'created' && 'fill-yellow-500 text-yellow-500',
                      session.status === 'cloning' && 'fill-blue-500 text-blue-500',
                      session.status === 'error' && 'fill-red-500 text-red-500'
                    )}
                  />
                  <span className="text-sm truncate flex-1 group-hover:text-foreground">
                    {session.name}
                  </span>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
