import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { invoke } from '@tauri-apps/api/core';
import type { Project } from '@/types/project';
import { logger } from '@/utils/logger';

/**
 * Fetch all projects ordered by recently opened
 */
export function useProjects() {
  return useQuery({
    queryKey: ['projects'],
    queryFn: async () => {
      logger.debug('[useProjects] Fetching projects');
      const projects = await invoke<Project[]>('list_projects');
      logger.debug('[useProjects] Fetched projects', { count: projects.length });
      return projects;
    },
    staleTime: 1000 * 60 * 5, // Cache for 5 minutes
  });
}

/**
 * Get or create a project by repository path
 * If project exists, returns it. If not, creates new project.
 */
export function useGetOrCreateProject() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (localRepoPath: string) => {
      logger.debug('[useGetOrCreateProject] Getting or creating project', { localRepoPath });
      const project = await invoke<Project>('get_or_create_project', {
        localRepoPath,
      });
      logger.debug('[useGetOrCreateProject] Project resolved', { project });
      return project;
    },
    onSuccess: (project) => {
      // Update projects cache
      queryClient.invalidateQueries({ queryKey: ['projects'] });

      // Optimistically add to cache if it doesn't exist
      queryClient.setQueryData(['project', project.id], project);
    },
    onError: (error) => {
      logger.error('[useGetOrCreateProject] Failed to get or create project', error as Error);
    },
  });
}

/**
 * Get a single project by ID
 */
export function useProject(projectId: string | undefined) {
  return useQuery({
    queryKey: ['project', projectId],
    queryFn: async () => {
      if (!projectId) {
        throw new Error('Project ID is required');
      }
      logger.debug('[useProject] Fetching project', { projectId });
      const project = await invoke<Project>('get_project', { projectId });
      return project;
    },
    enabled: !!projectId,
  });
}

/**
 * Delete a project (soft delete, cascades to sessions)
 */
export function useDeleteProject() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (projectId: string) => {
      logger.debug('[useDeleteProject] Deleting project', { projectId });
      await invoke('delete_project', { projectId });
    },
    onSuccess: () => {
      // Invalidate all project and session queries
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      queryClient.invalidateQueries({ queryKey: ['sessions'] });
    },
    onError: (error) => {
      logger.error('[useDeleteProject] Failed to delete project', error as Error);
    },
  });
}
