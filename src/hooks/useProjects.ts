import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { invoke } from '@tauri-apps/api/core';
import type { Project, NewProject } from '@/types';

/**
 * Hook to fetch projects for a session
 */
export function useSessionProjects(sessionId: string) {
  return useQuery({
    queryKey: ['projects', sessionId],
    queryFn: () => invoke<Project[]>('get_session_projects', { sessionId }),
    enabled: !!sessionId,
  });
}

/**
 * Hook to create a new project
 */
export function useCreateProject() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (newProject: NewProject) => invoke<Project>('create_project', { newProject }),
    onSuccess: (project) => {
      // Invalidate the projects list for this session
      queryClient.invalidateQueries({ queryKey: ['projects', project.session_id] });
    },
  });
}

/**
 * Hook to delete a project
 */
export function useDeleteProject() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (projectId: string) => invoke<void>('delete_project', { projectId }),
    onSuccess: (_, projectId) => {
      // Invalidate all project queries (we don't know which session this project belonged to)
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      // Also invalidate tasks for this project
      queryClient.invalidateQueries({ queryKey: ['tasks', projectId] });
    },
  });
}
