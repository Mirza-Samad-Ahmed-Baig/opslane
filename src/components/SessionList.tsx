import { useMemo } from 'react';
import { Loader2 } from 'lucide-react';
import { useSessions, useProjects } from '@/hooks';
import { SessionListItem } from './SessionListItem';
import { logger } from '@/utils/logger';

interface SessionListProps {
  activeSessionId?: string;
}

/**
 * SessionList - Left navigation showing sessions in flat chronological order
 *
 * Features:
 * - Flat list sorted by creation time (newest first)
 * - Two-line layout: title + (project • timestamp)
 * - Status indicator dots
 * - Click to navigate to session detail
 * - Auto-refresh via React Query event listeners
 */
export function SessionList({ activeSessionId }: SessionListProps) {
  const { data: sessions, isLoading: sessionsLoading } = useSessions();
  const { data: projects, isLoading: projectsLoading } = useProjects();

  // Create project lookup map for O(1) access
  const projectMap = useMemo(() => {
    if (!projects) return new Map();
    return new Map(projects.map((p) => [p.id, p]));
  }, [projects]);

  // Filter out orphaned sessions and sort by created_at DESC
  const sortedSessions = useMemo(() => {
    if (!sessions) return [];

    return sessions
      .filter((session) => {
        const hasProject = projectMap.has(session.project_id);
        if (!hasProject) {
          logger.warn('[SessionList] Orphaned session detected', {
            sessionId: session.id,
            sessionName: session.name,
            projectId: session.project_id,
          });
        }
        return hasProject;
      })
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }, [sessions, projectMap]);

  if (sessionsLoading || projectsLoading) {
    return (
      <div className="h-full flex flex-col items-center justify-center border-r bg-muted/30 p-8">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!sessions || sessions.length === 0) {
    return (
      <div className="h-full flex flex-col border-r bg-muted/30 p-4">
        <p className="text-xs text-muted-foreground mb-3">No sessions yet</p>
        <p className="text-xs text-muted-foreground">
          Use the quickstart form to create your first session.
        </p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col border-r bg-muted/30 min-h-0">
      <div className="flex-1 overflow-y-auto py-2 min-h-0">
        {sortedSessions.map((session) => {
          const project = projectMap.get(session.project_id);
          // Defensive check - should never happen due to filter above, but be safe
          if (!project) {
            logger.error(
              `[SessionList] Project not found for session ${session.id} (project: ${session.project_id})`
            );
            return null;
          }

          return (
            <SessionListItem
              key={session.id}
              session={session}
              project={project}
              isActive={session.id === activeSessionId}
            />
          );
        })}
      </div>
    </div>
  );
}
