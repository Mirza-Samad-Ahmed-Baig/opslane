import { useState } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useSessionProjects, useCreateProject } from '@/hooks/useProjects';
import { ProjectGroup } from './ProjectGroup';

interface LeftNavigationPanelProps {
  sessionId: string;
}

/**
 * LeftNavigationPanel - Left sidebar for projects and tasks hierarchy
 * Phase 2: Full implementation with project/task CRUD
 */
export function LeftNavigationPanel({ sessionId }: LeftNavigationPanelProps) {
  const { data: projects = [], isLoading } = useSessionProjects(sessionId);
  const createProject = useCreateProject();
  const [newProjectName, setNewProjectName] = useState('');
  const [showInput, setShowInput] = useState(false);

  const handleCreateProject = () => {
    if (!newProjectName.trim()) return;

    createProject.mutate(
      { session_id: sessionId, name: newProjectName },
      {
        onSuccess: () => {
          setNewProjectName('');
          setShowInput(false);
        },
      }
    );
  };

  return (
    <div className="flex flex-col h-full border-r bg-muted/30">
      {/* Header */}
      <div className="p-4 border-b">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-semibold">Projects</h2>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setShowInput(!showInput)}
            className="h-8 w-8 p-1"
            title="Add new project"
            aria-label="Add new project"
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>

        {showInput && (
          <Input
            value={newProjectName}
            onChange={(e) => setNewProjectName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleCreateProject();
              if (e.key === 'Escape') setShowInput(false);
            }}
            placeholder="Project name..."
            className="text-sm"
            autoFocus
          />
        )}
      </div>

      {/* Project list */}
      <div className="flex-1 overflow-auto p-2">
        {isLoading ? (
          <div className="text-xs text-muted-foreground p-2">Loading...</div>
        ) : projects.length === 0 ? (
          <div className="text-xs text-muted-foreground p-2">
            No projects yet. Click + to create one.
          </div>
        ) : (
          projects.map((project) => <ProjectGroup key={project.id} project={project} />)
        )}
      </div>
    </div>
  );
}
