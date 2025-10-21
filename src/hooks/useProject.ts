import { useQuery } from '@tanstack/react-query';
import { invoke } from '@tauri-apps/api/core';
import type { Project } from '@/types/project';

export function useProject(projectId: string | undefined) {
  return useQuery({
    queryKey: ['project', projectId],
    queryFn: async () => {
      if (!projectId) throw new Error('No project ID');
      return await invoke<Project>('get_project', { projectId });
    },
    enabled: !!projectId,
  });
}
