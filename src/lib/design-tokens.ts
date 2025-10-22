/**
 * Design Tokens
 *
 * Centralized constants for spacing, timing, and common patterns.
 * Reference: /docs/design-system.md
 *
 * Usage:
 * import { spacing, transitions, animations, focusRing } from '@/lib/design-tokens';
 */

export const spacing = {
  // Component internal spacing
  componentGap: 'gap-2', // 8px - between related elements (icon + text)
  sectionGap: 'gap-4', // 16px - between sections

  // Container padding
  compactPadding: 'p-3', // 12px - tight spaces (alerts, badges)
  defaultPadding: 'p-4', // 16px - most containers
  spaciousPadding: 'p-6', // 24px - cards, dialogs

  // Vertical spacing
  stackTight: 'space-y-2', // 8px - form fields, list items
  stackDefault: 'space-y-4', // 16px - card sections
  stackLoose: 'space-y-6', // 24px - page sections

  // Horizontal spacing
  rowTight: 'space-x-2', // 8px - button groups
  rowDefault: 'space-x-4', // 16px - form rows

  // Granular gap values (use in className directly)
  gap: {
    xs: 'gap-1', // 4px - very tight spacing
    sm: 'gap-2', // 8px - component internal
    md: 'gap-3', // 12px - moderate spacing
    lg: 'gap-4', // 16px - section spacing
    xl: 'gap-6', // 24px - large spacing
    '2xl': 'gap-8', // 32px - very large spacing
  },

  // Margin utilities
  margin: {
    xs: 'm-1', // 4px
    sm: 'm-2', // 8px
    md: 'm-3', // 12px
    lg: 'm-4', // 16px
    xl: 'm-6', // 24px
  },

  // Padding utilities
  padding: {
    xs: 'p-1', // 4px
    sm: 'p-2', // 8px
    md: 'p-3', // 12px
    lg: 'p-4', // 16px
    xl: 'p-6', // 24px
    '2xl': 'p-8', // 32px
  },
} as const;

export const transitions = {
  // Durations (ms)
  instant: 100,
  fast: 150,
  standard: 200,
  slow: 300,

  // Timing functions
  easeStandard: 'cubic-bezier(0.4, 0, 0.2, 1)',
  easeIn: 'ease-in',
  easeOut: 'ease-out',

  // CSS classes
  standardClass: 'transition-all duration-200',
  colors: 'transition-colors duration-150',
  transform: 'transition-transform duration-200',
} as const;

export const animations = {
  // Framer Motion variants
  fadeIn: {
    initial: { opacity: 0, y: 8 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: -8 },
    transition: { duration: 0.2 },
  },

  scaleIn: {
    initial: { opacity: 0, scale: 0.95 },
    animate: { opacity: 1, scale: 1 },
    exit: { opacity: 0, scale: 0.95 },
    transition: { duration: 0.2 },
  },

  slideIn: {
    initial: { opacity: 0, x: -20 },
    animate: { opacity: 1, x: 0 },
    exit: { opacity: 0, x: 20 },
    transition: { duration: 0.2 },
  },

  slideDown: {
    initial: { opacity: 0, y: -10 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: -10 },
    transition: { duration: 0.2 },
  },
} as const;

/**
 * Standard focus ring for all interactive elements
 * Follows WCAG 2.1 focus indicator guidelines
 */
export const focusRing =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2';

/**
 * Card hover effect (lift + shadow)
 * Calm Technology compliant (200ms, subtle movement)
 */
export const hoverCard = 'transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5';

/**
 * Standard hover brightness effect for buttons
 */
export const hoverBrightness = 'transition-standard hover:brightness-110';

export type SpacingKey = keyof typeof spacing;
export type TransitionKey = keyof typeof transitions;
export type AnimationKey = keyof typeof animations;
