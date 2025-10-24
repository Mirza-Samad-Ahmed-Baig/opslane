import { useNavigate } from 'react-router-dom';
import { Loader2, FolderOpen, ChevronDown, ChevronRight } from 'lucide-react';
import { useSessions, useProjects, useSessionPagination } from '@/hooks';
import { cn } from '@/lib/utils';
import { useState, useMemo } from 'react';
import type { Project } from '@/types/project';
import type { Session } from '@/types/session';
import { logger } from '@/utils/logger';

interface SessionListProps {
  activeSessionId?: string;
}

interface ProjectGroup {
  project: Project;
  sessions: Session[];
}

interface ProjectGroupWithPaginationProps {
  project: Project;
  sessions: Session[];
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  activeSessionId?: string;
}

function ProjectGroupWithPagination({
  project,
  sessions,
  isCollapsed,
  onToggleCollapse,
  activeSessionId,
}: ProjectGroupWithPaginationProps) {
  const navigate = useNavigate();

  const { visibleSessions, hasMoreSessions, hiddenCount, loadMoreSessions } = useSessionPagination({
    sessions,
    initialCount: 5,
    loadMoreCount: 10,
  });

  return (
    <div className="mb-3 last:mb-0">
      {/* Project Header */}
      <button
        onClick={onToggleCollapse}
        className="w-full px-3 py-3 flex items-center gap-2 hover:bg-muted/50 transition-colors"
        aria-expanded={!isCollapsed}
        aria-controls={`sessions-${project.id}`}
        aria-label={`${project.name} project with ${sessions.length} ${sessions.length === 1 ? 'session' : 'sessions'}`}
      >
        {isCollapsed ? (
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        )}
        <FolderOpen className="h-4 w-4 text-muted-foreground" />
        <span className="text-base font-semibold truncate" title={project.local_repo_path}>
          {project.name}
        </span>
        <span className="ml-auto text-xs text-muted-foreground font-medium">{sessions.length}</span>
      </button>

      {/* Sessions in this project */}
      {!isCollapsed && (
        <div id={`sessions-${project.id}`} className="space-y-1 pl-9">
          {visibleSessions.map((session) => (
            <button
              key={session.id}
              onClick={() => navigate(`/session/${session.id}`)}
              className={cn(
                'w-full px-3 py-2 flex items-center gap-2 hover:bg-muted/50 transition-colors text-left',
                'group relative',
                activeSessionId === session.id && 'bg-muted border-l-2 border-primary pl-[10px]'
              )}
            >
              <span
                className="text-sm truncate flex-1 group-hover:text-foreground"
                title={session.name}
              >
                {session.name}
              </span>
            </button>
          ))}

          {/* Load more button */}
          {hasMoreSessions && (
            <div className="px-3 py-2">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  loadMoreSessions();
                }}
                className="w-full text-xs text-muted-foreground hover:text-foreground transition-colors py-1.5 rounded hover:bg-muted/30"
              >
                Load 10 more ({hiddenCount} hidden)
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * SessionList - Left navigation showing sessions grouped by projects
 *
 * Features:
 * - Project-based grouping with folder names
 * - Collapsible project groups
 * - Pagination: Show last 5 sessions per project
 * - Status indicators with color-coded dots
 * - Click to navigate to session detail
 * - Auto-refresh via React Query event listeners
 */
export function SessionList({ activeSessionId }: SessionListProps) {
  const { data: sessions, isLoading: sessionsLoading } = useSessions();
  const { data: projects, isLoading: projectsLoading } = useProjects();

  const [collapsedProjects, setCollapsedProjects] = useState<Set<string>>(new Set());

  // Group sessions by project
  const projectGroups = useMemo<ProjectGroup[]>(() => {
    if (!sessions || !projects) return [];

    // Create a map of project_id -> project
    const projectMap = new Map(projects.map((p) => [p.id, p]));

    // Group sessions by project_id
    const grouped = sessions.reduce((acc, session) => {
      const project = projectMap.get(session.project_id);
      if (!project) {
        // Skip orphaned session and log warning for data integrity monitoring
        logger.warn('[SessionList] Orphaned session detected', {
          sessionId: session.id,
          sessionName: session.name,
          projectId: session.project_id,
        });
        return acc;
      }

      if (!acc.has(project.id)) {
        acc.set(project.id, { project, sessions: [] });
      }
      acc.get(project.id)!.sessions.push(session);
      return acc;
    }, new Map<string, ProjectGroup>());

    // Convert to array and sort by project last_opened_at
    return Array.from(grouped.values()).sort((a, b) => {
      const aTime = a.project.last_opened_at || a.project.created_at;
      const bTime = b.project.last_opened_at || b.project.created_at;
      return new Date(bTime).getTime() - new Date(aTime).getTime();
    });
  }, [sessions, projects]);

  const toggleProjectCollapse = (projectId: string) => {
    setCollapsedProjects((prev) => {
      const next = new Set(prev);
      if (next.has(projectId)) {
        next.delete(projectId);
      } else {
        next.add(projectId);
      }
      return next;
    });
  };

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
    <div className="h-full flex flex-col border-r bg-muted/30">
      <div className="flex-1 overflow-y-auto py-2">
        {projectGroups.map(({ project, sessions: projectSessions }) => {
          const isCollapsed = collapsedProjects.has(project.id);

          return (
            <ProjectGroupWithPagination
              key={project.id}
              project={project}
              sessions={projectSessions}
              isCollapsed={isCollapsed}
              onToggleCollapse={() => toggleProjectCollapse(project.id)}
              activeSessionId={activeSessionId}
            />
          );
        })}
      </div>
    </div>
  );
}
