/**
 * Formats an ISO 8601 timestamp as human-readable relative time
 * @param timestamp - ISO 8601 timestamp string
 * @returns Human-readable string like "Just now", "2m ago", "Yesterday", "Jan 24"
 */
export function formatRelativeTime(timestamp: string): string {
  const now = new Date();
  const time = new Date(timestamp);
  const diffMs = now.getTime() - time.getTime();

  // Handle future dates
  if (diffMs < 0) {
    return 'Just now';
  }

  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSecs < 10) return 'Just now';
  if (diffSecs < 60) return `${diffSecs} sec${diffSecs > 1 ? 's' : ''} ago`;
  if (diffMins < 60) return `${diffMins} min${diffMins > 1 ? 's' : ''} ago`;
  if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;

  // Format as date for older items
  const month = time.toLocaleDateString('en-US', { month: 'short' });
  const day = time.getDate();

  // Include year if not current year
  if (time.getFullYear() !== now.getFullYear()) {
    return `${month} ${day}, ${time.getFullYear()}`;
  }

  return `${month} ${day}`;
}
