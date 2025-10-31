/**
 * Native OS notification utilities using Tauri notification plugin
 *
 * Handles notification display and focus restoration using Tauri's native APIs.
 * Only shows notifications when app window is unfocused to avoid duplication.
 */

import {
  sendNotification,
  isPermissionGranted,
  requestPermission,
} from '@tauri-apps/plugin-notification';
import { getCurrentWindow } from '@tauri-apps/api/window';

export interface NotificationOptions {
  title: string;
  body: string;
  icon?: string;
}

/**
 * Sanitize text for display in notifications
 * Removes potentially problematic characters and limits length
 */
function sanitizeForNotification(text: string): string {
  return text
    .replace(/[<>]/g, '') // Remove HTML-like characters
    .substring(0, 200); // Limit length to prevent overflow
}

/**
 * Check if notification permission is granted
 */
export async function checkNotificationPermission(): Promise<boolean> {
  try {
    return await isPermissionGranted();
  } catch (error) {
    console.error('[Notifications] Failed to check permission:', error);
    return false;
  }
}

/**
 * Request notification permission from user
 */
export async function requestNotificationPermission(): Promise<boolean> {
  try {
    const currentlyGranted = await isPermissionGranted();
    if (currentlyGranted) {
      return true;
    }

    const permission = await requestPermission();
    return permission === 'granted';
  } catch (error) {
    console.error('[Notifications] Failed to request permission:', error);
    return false;
  }
}

/**
 * Show OS notification only if:
 * 1. Window is not focused (avoid duplication with in-app toasts)
 * 2. Permission is granted
 */
export async function showNotification(options: NotificationOptions): Promise<void> {
  try {
    // Get current window focus state
    const window = getCurrentWindow();
    const isFocused = await window.isFocused();

    console.log('[Notifications] showNotification called:', {
      title: options.title,
      isFocused,
    });

    // Only notify if window is not focused
    if (isFocused) {
      console.debug('[Notifications] Window focused, skipping OS notification');
      return;
    }

    // Check permission
    const hasPermission = await checkNotificationPermission();
    if (!hasPermission) {
      console.warn('[Notifications] Permission not granted');
      return;
    }

    // Send notification using Tauri plugin
    await sendNotification({
      title: options.title,
      body: options.body,
      icon: options.icon,
    });

    console.log('[Notifications] Shown:', options.title);
  } catch (error) {
    console.error('[Notifications] Failed to show:', error);
  }
}

/**
 * Convenience: Show task completion notification
 */
export function notifyTaskComplete(sessionName?: string): void {
  console.log('[Notifications] notifyTaskComplete called, sessionName:', sessionName);
  const safeName = sessionName ? sanitizeForNotification(sessionName) : undefined;
  showNotification({
    title: '✅ Opslane',
    body: safeName ? `Task completed in "${safeName}"` : 'Task completed',
  }).catch((err) => console.error('[Notifications] Error in notifyTaskComplete:', err));
}

/**
 * Convenience: Show error notification
 */
export function notifyError(error: string, sessionName?: string): void {
  console.log('[Notifications] notifyError called, error:', error, 'sessionName:', sessionName);
  const safeError = sanitizeForNotification(error);
  const safeName = sessionName ? sanitizeForNotification(sessionName) : undefined;
  showNotification({
    title: '❌ Opslane Error',
    body: safeName ? `Error in "${safeName}": ${safeError}` : safeError,
  }).catch((err) => console.error('[Notifications] Error in notifyError:', err));
}

/**
 * Get notification permission status (async version)
 * Returns whether notifications are currently permitted
 */
export async function getNotificationPermission(): Promise<'granted' | 'denied' | 'default'> {
  try {
    const isGranted = await checkNotificationPermission();
    return isGranted ? 'granted' : 'default';
  } catch (error) {
    console.error('[Notifications] Failed to get permission status:', error);
    return 'default';
  }
}
