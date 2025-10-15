import { useQuery } from '@tanstack/react-query';
import { invoke } from '@tauri-apps/api/core';
import { logger } from '@/utils/logger';

/**
 * Check if Docker is available
 * Used to show warnings before creating sessions
 */
export function useDockerStatus() {
  return useQuery({
    queryKey: ['docker-status'],
    queryFn: async () => {
      logger.debug('Checking Docker availability');
      try {
        const isAvailable = await invoke<boolean>('check_docker');
        logger.info('Docker status checked', { isAvailable });
        return isAvailable;
      } catch (error) {
        logger.warn('Docker check failed', { error: (error as Error).message });
        return false;
      }
    },
    // Check Docker status every 30 seconds (less frequent than sessions)
    refetchInterval: 30000,
    // Don't fail the whole app if Docker check fails
    retry: false,
  });
}
