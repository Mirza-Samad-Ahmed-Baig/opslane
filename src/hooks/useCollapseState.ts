import { useState, useCallback, useEffect } from 'react';

interface CollapseState {
  expandedGroupIds: Set<string>; // Track which groups are expanded (default is collapsed)
  expandedToolIds: Set<string>; // Track which tools are expanded (default is collapsed)
}

const STORAGE_KEY = 'opslane-tool-collapse-state';
const STORAGE_VERSION = 'v1';

/**
 * Manage collapse state with localStorage persistence
 *
 * Strategy:
 * - Default: All groups/tools are collapsed (Progressive Disclosure)
 * - Track only explicitly expanded items in Sets
 * - User preferences persist across sessions
 */
export function useCollapseState(sessionId: string) {
  const [state, setState] = useState<CollapseState>(() => {
    // Load from localStorage with quota error handling
    try {
      const key = `${STORAGE_KEY}-${STORAGE_VERSION}-${sessionId}`;
      const stored = localStorage.getItem(key);
      if (stored) {
        const parsed = JSON.parse(stored);
        return {
          expandedGroupIds: new Set(parsed.expandedGroupIds || []),
          expandedToolIds: new Set(parsed.expandedToolIds || []),
        };
      }
    } catch (e) {
      if (e instanceof Error && e.name === 'QuotaExceededError') {
        console.warn('[useCollapseState] localStorage quota exceeded, clearing old states');
        // Clear old version states
        Object.keys(localStorage).forEach((key) => {
          if (key.startsWith(STORAGE_KEY) && !key.includes(STORAGE_VERSION)) {
            localStorage.removeItem(key);
          }
        });
      } else {
        console.warn('[useCollapseState] Failed to load state:', e);
      }
    }

    return {
      expandedGroupIds: new Set<string>(),
      expandedToolIds: new Set<string>(),
    };
  });

  // Persist to localStorage with quota error handling
  useEffect(() => {
    try {
      const key = `${STORAGE_KEY}-${STORAGE_VERSION}-${sessionId}`;
      const serialized = JSON.stringify({
        expandedGroupIds: Array.from(state.expandedGroupIds),
        expandedToolIds: Array.from(state.expandedToolIds),
      });
      localStorage.setItem(key, serialized);
    } catch (e) {
      if (e instanceof Error && e.name === 'QuotaExceededError') {
        console.warn('[useCollapseState] localStorage quota exceeded, state not saved');
        // Could implement LRU eviction here if needed
      } else {
        console.warn('[useCollapseState] Failed to save state:', e);
      }
    }
  }, [state, sessionId]);

  const isGroupCollapsed = useCallback(
    (groupId: string) => {
      // Since default is always collapsed, return opposite of expanded state
      return !state.expandedGroupIds.has(groupId);
    },
    [state.expandedGroupIds]
  );

  const isToolCollapsed = useCallback(
    (toolId: string) => {
      return !state.expandedToolIds.has(toolId);
    },
    [state.expandedToolIds]
  );

  const toggleGroup = useCallback((groupId: string, currentlyCollapsed: boolean) => {
    setState((prev) => {
      const next = {
        expandedGroupIds: new Set(prev.expandedGroupIds),
        expandedToolIds: new Set(prev.expandedToolIds),
      };

      if (currentlyCollapsed) {
        // Expanding: add to expanded set
        next.expandedGroupIds.add(groupId);
      } else {
        // Collapsing: remove from expanded set
        next.expandedGroupIds.delete(groupId);
      }

      return next;
    });
  }, []);

  const toggleTool = useCallback((toolId: string, currentlyCollapsed: boolean) => {
    setState((prev) => {
      const next = {
        expandedGroupIds: new Set(prev.expandedGroupIds),
        expandedToolIds: new Set(prev.expandedToolIds),
      };

      if (currentlyCollapsed) {
        next.expandedToolIds.add(toolId);
      } else {
        next.expandedToolIds.delete(toolId);
      }

      return next;
    });
  }, []);

  const expandAll = useCallback((groupIds: string[], toolIds: string[]) => {
    setState({
      expandedGroupIds: new Set(groupIds),
      expandedToolIds: new Set(toolIds),
    });
  }, []);

  const collapseAll = useCallback(() => {
    setState({
      expandedGroupIds: new Set<string>(),
      expandedToolIds: new Set<string>(),
    });
  }, []);

  return {
    isGroupCollapsed,
    isToolCollapsed,
    toggleGroup,
    toggleTool,
    expandAll,
    collapseAll,
  };
}
