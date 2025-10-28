import { platform } from '@tauri-apps/plugin-os';

// Cache platform detection on module load
const currentPlatform = platform();

/**
 * Detect if the current platform is macOS.
 * Used to conditionally apply traffic light padding.
 */
export function isMacOS(): boolean {
  return currentPlatform === 'macos';
}

/**
 * Detect if the current platform is Windows.
 * Used to show custom window controls.
 */
export function isWindows(): boolean {
  return currentPlatform === 'windows';
}

/**
 * Detect if the current platform is Linux.
 * Used to show custom window controls.
 */
export function isLinux(): boolean {
  return currentPlatform === 'linux';
}

/**
 * Check if the platform needs custom window controls.
 * Returns true for Windows and Linux (not macOS).
 */
export function needsCustomControls(): boolean {
  return !isMacOS();
}
