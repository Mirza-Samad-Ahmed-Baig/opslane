import { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { toast } from 'sonner';

export interface SyncState {
  active_session_id: string | null;
  started_at: string | null;
  is_active: boolean;
}

export interface SyncSwitchRequest {
  current: string;
  requested: string;
}

/**
 * Hook for managing active sync state
 * Follows Design Principle #2: Instant Feedback
 */
export function useActiveSync(projectId: string) {
  const [syncState, setSyncState] = useState<SyncState | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Get initial sync state
  useEffect(() => {
    if (!projectId) return;

    const fetchSyncStatus = async () => {
      try {
        const status = await invoke<SyncState>('get_sync_status', {
          request: { project_id: projectId },
        });
        setSyncState(status);
      } catch (err) {
        console.error('Failed to get sync status:', err);
        setError(err as string);
      }
    };

    fetchSyncStatus();
  }, [projectId]);

  // Listen for sync events (Principle #2: Instant Feedback)
  useEffect(() => {
    const unlistenEnabled = listen<{ session_id: string; session_name: string }>(
      'sync-enabled',
      (event) => {
        setSyncState({
          active_session_id: event.payload.session_id,
          started_at: new Date().toISOString(),
          is_active: true,
        });

        // Subtle notification (Principle #10: Calm Technology)
        toast.success(`Syncing to ${event.payload.session_name}`, {
          duration: 3000,
        });
      }
    );

    const unlistenDisabled = listen<{ session_id: string }>('sync-disabled', () => {
      setSyncState({
        active_session_id: null,
        started_at: null,
        is_active: false,
      });

      toast.info('Sync stopped', { duration: 2000 });
    });

    const unlistenSwitchRequired = listen<SyncSwitchRequest>('sync-switch-required', (event) => {
      // This will be handled by useSyncSwitch hook
      console.log('Switch required:', event.payload);
    });

    // Cleanup listeners
    return () => {
      unlistenEnabled.then((fn) => fn());
      unlistenDisabled.then((fn) => fn());
      unlistenSwitchRequired.then((fn) => fn());
    };
  }, []);

  // Enable sync for a session
  const enableSync = useCallback(async (sessionId: string) => {
    setLoading(true);
    setError(null);

    try {
      await invoke('enable_session_sync', {
        request: { session_id: sessionId },
      });
    } catch (err) {
      const errorMsg = err as string;
      setError(errorMsg);

      // Only show error if it's not a switch request
      if (!errorMsg.includes('Another session is currently syncing')) {
        toast.error('Failed to enable sync', {
          description: errorMsg,
        });
      }
    } finally {
      setLoading(false);
    }
  }, []);

  // Stop all sync
  const stopSync = useCallback(async () => {
    if (!projectId) return;

    setLoading(true);
    setError(null);

    try {
      await invoke('disable_all_sync', {
        request: { project_id: projectId },
      });
    } catch (err) {
      setError(err as string);
      toast.error('Failed to stop sync', {
        description: err as string,
      });
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  // Check if a specific session is active
  const isSessionActive = useCallback(
    (sessionId: string) => {
      return syncState?.active_session_id === sessionId;
    },
    [syncState]
  );

  return {
    syncState,
    activeSession: syncState,
    enableSync,
    stopSync,
    isActive: syncState?.is_active || false,
    isSessionActive,
    loading,
    error,
  };
}
