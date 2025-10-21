import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import type { SyncResult, SyncProgress, SyncStatusEvent } from '@/types/sync';

interface SyncCompleteEvent {
  session_id: string;
  files_synced: number;
  files_failed: number;
}

export function useSyncSession(sessionId: string) {
  const [syncing, setSyncing] = useState(false);
  const [progress, setProgress] = useState<SyncProgress | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let unlistenProgress: (() => void) | undefined;
    let unlistenStatus: (() => void) | undefined;
    let unlistenComplete: (() => void) | undefined;

    // Set up event listeners
    const setupListeners = async () => {
      // Listen for progress events
      unlistenProgress = await listen<SyncProgress>('sync-progress', (event) => {
        if (event.payload.session_id === sessionId) {
          setProgress(event.payload);
        }
      });

      // Listen for status changes
      unlistenStatus = await listen<SyncStatusEvent>('session-sync-status', (event) => {
        if (event.payload.session_id === sessionId) {
          setSyncing(event.payload.status === 'syncing');
        }
      });

      // Listen for completion
      unlistenComplete = await listen<SyncCompleteEvent>('session-sync-complete', (event) => {
        if (event.payload.session_id === sessionId) {
          setSyncing(false);
          setProgress(null);
        }
      });
    };

    setupListeners();

    return () => {
      // Cleanup event listeners
      unlistenProgress?.();
      unlistenStatus?.();
      unlistenComplete?.();
    };
  }, [sessionId]);

  const syncToProject = async (): Promise<SyncResult> => {
    setSyncing(true);
    setError(null);

    try {
      const result = await invoke<SyncResult>('sync_session_to_project', {
        sessionId,
      });
      return result;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      setError(errorMsg);
      setSyncing(false);
      throw err;
    }
  };

  return {
    syncing,
    progress,
    error,
    syncToProject,
  };
}
