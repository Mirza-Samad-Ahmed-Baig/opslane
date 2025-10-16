import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { invoke } from '@tauri-apps/api/core';
import type { Task, NewTask, TaskStatus } from '@/types';

/**
 * Hook to fetch tasks for a project
 */
export function useProjectTasks(projectId: string) {
  return useQuery({
    queryKey: ['tasks', projectId],
    queryFn: () => invoke<Task[]>('get_project_tasks', { projectId }),
    enabled: !!projectId,
  });
}

/**
 * Hook to create a new task
 */
export function useCreateTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (newTask: NewTask) => invoke<Task>('create_task', { newTask }),
    onSuccess: (task) => {
      // Invalidate the tasks list for this project
      queryClient.invalidateQueries({ queryKey: ['tasks', task.project_id] });
    },
  });
}

/**
 * Hook to update task status
 */
export function useUpdateTaskStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ taskId, status }: { taskId: string; status: TaskStatus }) =>
      invoke<Task>('update_task_status', { taskId, status }),
    onSuccess: (task) => {
      // Invalidate the tasks list for this project
      queryClient.invalidateQueries({ queryKey: ['tasks', task.project_id] });
    },
  });
}

/**
 * Hook to delete a task
 */
export function useDeleteTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (taskId: string) => invoke<void>('delete_task', { taskId }),
    onSuccess: () => {
      // Invalidate all task queries
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    },
  });
}
