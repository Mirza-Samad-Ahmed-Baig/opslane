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

/**
 * Filters out HTML event props that conflict with framer-motion
 * This is necessary because HTML event handlers have different type signatures
 * than framer-motion's event handlers
 */
export function filterMotionProps<T extends Record<string, unknown>>(props: T) {
  const {
    onDrag,
    onDragStart,
    onDragEnd,
    onDragEnter,
    onDragLeave,
    onDragOver,
    onAnimationStart,
    onAnimationEnd,
    ...safeProps
  } = props;

  // Explicitly void to satisfy ESLint no-unused-vars
  void onDrag;
  void onDragStart;
  void onDragEnd;
  void onDragEnter;
  void onDragLeave;
  void onDragOver;
  void onAnimationStart;
  void onAnimationEnd;

  return safeProps;
}
