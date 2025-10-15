import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Utility function for constructing className strings conditionally.
 * Combines clsx for conditional class names with tailwind-merge to deduplicate Tailwind classes.
 *
 * @param inputs - Any number of class values (strings, objects, arrays, etc.)
 * @returns Merged and deduplicated className string
 *
 * @example
 * cn('px-2 py-1', condition && 'bg-blue-500')
 * cn({ 'text-red-500': isError }, 'font-bold')
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
