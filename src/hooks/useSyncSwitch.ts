import { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

export interface SwitchRequest {
  current: string;
  requested: string;
}

/**
 * Hook for handling sync session switching
 * Follows Design Principle #3: Resilient by Default
 */
export function useSyncSwitch(projectId: string) {
  const [switchRequest, setSwitchRequest] = useState<SwitchRequest | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  // Listen for switch requests from backend
  useEffect(() => {
    const unlisten = listen<SwitchRequest>('sync-switch-required', (event) => {
      setSwitchRequest({
        current: event.payload.current,
        requested: event.payload.requested,
      });
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  // Confirm and switch to new session
  const confirmSwitch = useCallback(async () => {
    if (!switchRequest || !projectId) return;

    setIsProcessing(true);

    try {
      // First stop current sync
      await invoke('disable_all_sync', {
        request: { project_id: projectId },
      });

      // Small delay to ensure cleanup
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Then enable new sync
      await invoke('enable_session_sync', {
        request: { session_id: switchRequest.requested },
      });

      setSwitchRequest(null);
    } catch (err) {
      console.error('Failed to switch sync:', err);
      // Error will be handled by toast in the main sync hook
    } finally {
      setIsProcessing(false);
    }
  }, [switchRequest, projectId]);

  // Cancel switch request
  const cancelSwitch = useCallback(() => {
    setSwitchRequest(null);
  }, []);

  return {
    switchRequest,
    confirmSwitch,
    cancelSwitch,
    isProcessing,
    hasPendingSwitch: switchRequest !== null,
  };
}
