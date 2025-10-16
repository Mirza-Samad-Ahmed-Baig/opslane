import { Circle, CircleDot, CheckCircle2 } from 'lucide-react';
import { useUpdateTaskStatus } from '@/hooks/useTasks';
import type { Task } from '@/types';
import { cn } from '@/lib/utils';

interface TaskItemProps {
  task: Task;
}

/**
 * TaskItem - Individual task display with status cycling
 * Click to cycle: pending � in_progress � completed � pending
 */
export function TaskItem({ task }: TaskItemProps) {
  const updateStatus = useUpdateTaskStatus();

  const cycleStatus = () => {
    const nextStatus = {
      pending: 'in_progress',
      in_progress: 'completed',
      completed: 'pending',
    }[task.status] as 'pending' | 'in_progress' | 'completed';

    updateStatus.mutate({ taskId: task.id, status: nextStatus });
  };

  const StatusIcon = {
    pending: Circle,
    in_progress: CircleDot,
    completed: CheckCircle2,
  }[task.status];

  const getStatusLabel = () => {
    switch (task.status) {
      case 'pending':
        return 'Mark as in progress';
      case 'in_progress':
        return 'Mark as completed';
      case 'completed':
        return 'Mark as pending';
    }
  };

  return (
    <button
      type="button"
      onClick={cycleStatus}
      className={cn(
        'flex items-center gap-2 p-2 rounded text-sm cursor-pointer w-full text-left',
        'hover:bg-muted focus:bg-muted focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-1',
        'transition-colors',
        task.status === 'completed' && 'opacity-60'
      )}
      aria-label={`${task.name} - ${getStatusLabel()}`}
      title={getStatusLabel()}
    >
      <StatusIcon className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
      <span className={cn('flex-1', task.status === 'completed' && 'line-through')}>
        {task.name}
      </span>
    </button>
  );
}
