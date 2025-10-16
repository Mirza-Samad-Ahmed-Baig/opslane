import { useState } from 'react';
import { ChevronDown, ChevronRight, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useProjectTasks, useCreateTask } from '@/hooks/useTasks';
import { TaskItem } from './TaskItem';
import type { Project } from '@/types';

interface ProjectGroupProps {
  project: Project;
}

/**
 * ProjectGroup - Expandable project with task list
 * Shows task completion count and allows adding new tasks
 */
export function ProjectGroup({ project }: ProjectGroupProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [showTaskInput, setShowTaskInput] = useState(false);
  const [newTaskName, setNewTaskName] = useState('');
  const { data: tasks = [] } = useProjectTasks(project.id);
  const createTask = useCreateTask();

  const completedCount = tasks.filter((t) => t.status === 'completed').length;

  const handleCreateTask = () => {
    if (!newTaskName.trim()) return;

    createTask.mutate(
      { project_id: project.id, name: newTaskName },
      {
        onSuccess: () => {
          setNewTaskName('');
          setShowTaskInput(false);
        },
      }
    );
  };

  return (
    <div className="mb-2">
      <div className="flex items-center gap-1 p-2 rounded hover:bg-muted group">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setIsExpanded(!isExpanded)}
          className="h-8 w-8 p-1"
          title={isExpanded ? 'Collapse' : 'Expand'}
          aria-label={`${isExpanded ? 'Collapse' : 'Expand'} ${project.name} tasks`}
          aria-expanded={isExpanded}
        >
          {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </Button>

        <span className="text-sm font-medium flex-1">{project.name}</span>

        <span className="text-xs text-muted-foreground">
          {completedCount}/{tasks.length}
        </span>

        <Button
          variant="ghost"
          size="icon"
          onClick={() => setShowTaskInput(true)}
          className="h-8 w-8 p-1 opacity-40 group-hover:opacity-100 focus:opacity-100 transition-opacity"
          title="Add new task"
          aria-label={`Add new task to ${project.name}`}
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>

      {isExpanded && (
        <div className="ml-6 mt-1 space-y-1">
          {showTaskInput && (
            <Input
              value={newTaskName}
              onChange={(e) => setNewTaskName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCreateTask();
                if (e.key === 'Escape') setShowTaskInput(false);
              }}
              placeholder="Task name..."
              className="text-sm h-7"
              autoFocus
            />
          )}

          {tasks.map((task) => (
            <TaskItem key={task.id} task={task} />
          ))}

          {tasks.length === 0 && !showTaskInput && (
            <p className="text-xs text-muted-foreground p-2">No tasks yet. Click + to add one.</p>
          )}
        </div>
      )}
    </div>
  );
}
