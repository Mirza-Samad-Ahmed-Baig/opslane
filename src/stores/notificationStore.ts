import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

// Notification types
export type NotificationType = 'complete' | 'error';

export interface Notification {
  id: string; // UUID
  sessionId: string; // For navigation
  sessionName: string; // Human-readable name
  type: NotificationType;
  message: string; // "Task completed" or error message
  timestamp: Date; // ISO 8601 string (converted to Date on load)
  read: boolean;
}

interface NotificationState {
  notifications: Notification[];
  addNotification: (notification: Omit<Notification, 'id' | 'timestamp' | 'read'>) => void;
  markRead: (id: string) => void;
  markAllRead: () => void;
  clearNotification: (id: string) => void;
  clearAll: () => void;
  getUnreadCount: () => number;
}

// Storage configuration
const STORAGE_KEY = 'opslane-notifications';
const STORAGE_VERSION = 'v1';

export const useNotificationStore = create<NotificationState>()(
  persist(
    (set, get) => ({
      notifications: [],

      addNotification: (notification) => {
        const state = get();
        const now = Date.now();
        const DEDUP_WINDOW_MS = 2000; // 2 second deduplication window

        // Check if a recent notification exists for this session (within 2 seconds)
        // This prevents race conditions from rapid successive calls
        const recentNotification = state.notifications.find(
          (n) =>
            n.sessionId === notification.sessionId &&
            n.type === notification.type &&
            now - new Date(n.timestamp).getTime() < DEDUP_WINDOW_MS
        );

        // If a recent notification exists, ignore this one
        if (recentNotification) {
          console.debug(
            '[NotificationStore] Ignoring duplicate notification for session:',
            notification.sessionId,
            'type:',
            notification.type
          );
          return;
        }

        // Remove any old notifications for this session/type (read or unread)
        // This ensures only one notification per session at any time
        const filteredNotifications = state.notifications.filter(
          (n) => !(n.sessionId === notification.sessionId && n.type === notification.type)
        );

        // Add the new notification
        const newNotification: Notification = {
          ...notification,
          id: crypto.randomUUID(),
          timestamp: new Date(),
          read: false,
        };

        set(() => ({
          notifications: [newNotification, ...filteredNotifications], // Newest first
        }));

        console.debug('[NotificationStore] Added notification:', newNotification);
      },

      markRead: (id) => {
        set((state) => ({
          notifications: state.notifications.map((n) => (n.id === id ? { ...n, read: true } : n)),
        }));
      },

      markAllRead: () => {
        set((state) => ({
          notifications: state.notifications.map((n) => ({ ...n, read: true })),
        }));
      },

      clearNotification: (id) => {
        set((state) => ({
          notifications: state.notifications.filter((n) => n.id !== id),
        }));
      },

      clearAll: () => {
        set({ notifications: [] });
      },

      getUnreadCount: () => {
        return get().notifications.filter((n) => !n.read).length;
      },
    }),
    {
      name: `${STORAGE_KEY}-${STORAGE_VERSION}`,
      storage: createJSONStorage(() => localStorage),
      // Transform dates during serialization/deserialization
      partialize: (state) => ({ notifications: state.notifications }),
      onRehydrateStorage: () => (state) => {
        if (state) {
          // Convert timestamp strings back to Date objects
          state.notifications = state.notifications.map((n) => ({
            ...n,
            timestamp: new Date(n.timestamp),
          }));
        }
      },
    }
  )
);
