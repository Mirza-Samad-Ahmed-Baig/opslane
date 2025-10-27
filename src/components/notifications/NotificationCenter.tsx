import React from 'react';
import { useNavigate } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import { CheckCheck, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useNotificationStore } from '@/stores/notificationStore';
import type { Notification } from '@/stores/notificationStore';

interface NotificationCenterProps {
  onClose: () => void;
}

export function NotificationCenter({ onClose }: NotificationCenterProps) {
  const navigate = useNavigate();
  const notifications = useNotificationStore((state) => state.notifications);
  const markRead = useNotificationStore((state) => state.markRead);
  const markAllRead = useNotificationStore((state) => state.markAllRead);
  const clearNotification = useNotificationStore((state) => state.clearNotification);
  const clearAll = useNotificationStore((state) => state.clearAll);

  const handleNotificationClick = (notification: Notification) => {
    // Mark as read
    markRead(notification.id);

    // Navigate to session
    navigate(`/session/${notification.sessionId}`);

    // Close dropdown
    onClose();
  };

  const handleClearClick = (e: React.MouseEvent, id: string) => {
    e.stopPropagation(); // Prevent triggering notification click
    clearNotification(id);
  };

  const handleMarkAllRead = () => {
    markAllRead();
  };

  const handleClearAll = () => {
    if (confirm('Clear all notifications?')) {
      clearAll();
    }
  };

  return (
    <div className="bg-popover text-popover-foreground rounded-lg shadow-lg border w-96 max-h-[500px] flex flex-col">
      {/* Header */}
      <div className="px-4 py-3 border-b flex items-center justify-between">
        <h3 className="font-semibold text-sm">Notifications</h3>
        <div className="flex items-center gap-1">
          {notifications.length > 0 && (
            <>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleMarkAllRead}
                title="Mark all as read"
              >
                <CheckCheck className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="sm" onClick={handleClearAll} title="Clear all">
                <Trash2 className="h-4 w-4" />
              </Button>
            </>
          )}
          <Button variant="ghost" size="sm" onClick={onClose} title="Close">
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Notification list */}
      <div className="overflow-y-auto flex-1">
        {notifications.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-muted-foreground">
            No notifications
          </div>
        ) : (
          <div className="divide-y">
            {notifications.map((notification) => (
              <NotificationItem
                key={notification.id}
                notification={notification}
                onClick={() => handleNotificationClick(notification)}
                onClearClick={(e) => handleClearClick(e, notification.id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

interface NotificationItemProps {
  notification: Notification;
  onClick: () => void;
  onClearClick: (e: React.MouseEvent) => void;
}

function NotificationItem({ notification, onClick, onClearClick }: NotificationItemProps) {
  const icon = notification.type === 'complete' ? '✅' : '❌';
  const bgColor = notification.read ? 'bg-transparent' : 'bg-accent/50';
  const relativeTime = formatDistanceToNow(notification.timestamp, { addSuffix: true });

  return (
    <button
      className={`w-full px-4 py-3 text-left hover:bg-accent transition-colors flex items-start gap-3 ${bgColor}`}
      onClick={onClick}
    >
      <span className="text-lg flex-shrink-0">{icon}</span>
      <div className="flex-1 min-w-0">
        <p className="font-medium text-sm truncate">{notification.sessionName}</p>
        <p className="text-xs text-muted-foreground truncate">{notification.message}</p>
        <p className="text-xs text-muted-foreground mt-1">{relativeTime}</p>
      </div>
      <Button
        variant="ghost"
        size="icon"
        className="h-6 w-6 flex-shrink-0"
        onClick={onClearClick}
        title="Clear notification"
      >
        <X className="h-3 w-3" />
      </Button>
    </button>
  );
}
