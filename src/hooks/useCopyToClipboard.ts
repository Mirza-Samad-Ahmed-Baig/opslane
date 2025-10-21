import { useState, useCallback } from 'react';

/**
 * Hook for copying text to clipboard with feedback
 *
 * @param timeout Duration to show "copied" state in milliseconds (default: 2000)
 * @returns Object with copied state and copy function
 */
export function useCopyToClipboard(timeout = 2000) {
  const [copied, setCopied] = useState(false);

  const copy = useCallback(
    async (text: string) => {
      try {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), timeout);
      } catch (error) {
        console.error('Failed to copy to clipboard:', error);
        // Optionally, could set an error state here
      }
    },
    [timeout]
  );

  return { copied, copy };
}
