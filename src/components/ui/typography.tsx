import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

/**
 * Typography Components - Consistent text styling across the application
 *
 * Follows design system type scale with semantic HTML elements.
 * All components support standard HTML attributes and className overrides.
 *
 * Usage:
 * ```tsx
 * <Heading1>Page Title</Heading1>
 * <Heading2>Section Title</Heading2>
 * <Heading3>Subsection Title</Heading3>
 * <Body>Regular paragraph text</Body>
 * <BodyLarge>Emphasized paragraph text</BodyLarge>
 * <BodySmall>De-emphasized text</BodySmall>
 * <Caption>Metadata, timestamps, helper text</Caption>
 * <Label>Form labels, badges</Label>
 * ```
 */

// Heading 1 - Page titles, main headings
const heading1Variants = cva(
  'scroll-m-20 text-2xl font-bold tracking-tight leading-tight text-foreground transition-colors',
  {
    variants: {
      variant: {
        default: '',
        muted: 'text-muted-foreground',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
);

export interface Heading1Props
  extends React.HTMLAttributes<HTMLHeadingElement>,
    VariantProps<typeof heading1Variants> {}

export const Heading1 = React.forwardRef<HTMLHeadingElement, Heading1Props>(
  ({ className, variant, ...props }, ref) => (
    <h1 ref={ref} className={cn(heading1Variants({ variant }), className)} {...props} />
  )
);
Heading1.displayName = 'Heading1';

// Heading 2 - Section headings
const heading2Variants = cva(
  'scroll-m-20 text-xl font-semibold tracking-tight leading-snug text-foreground transition-colors',
  {
    variants: {
      variant: {
        default: '',
        muted: 'text-muted-foreground',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
);

export interface Heading2Props
  extends React.HTMLAttributes<HTMLHeadingElement>,
    VariantProps<typeof heading2Variants> {}

export const Heading2 = React.forwardRef<HTMLHeadingElement, Heading2Props>(
  ({ className, variant, ...props }, ref) => (
    <h2 ref={ref} className={cn(heading2Variants({ variant }), className)} {...props} />
  )
);
Heading2.displayName = 'Heading2';

// Heading 3 - Subsection headings
const heading3Variants = cva(
  'scroll-m-20 text-lg font-semibold tracking-tight leading-normal text-foreground transition-colors',
  {
    variants: {
      variant: {
        default: '',
        muted: 'text-muted-foreground',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
);

export interface Heading3Props
  extends React.HTMLAttributes<HTMLHeadingElement>,
    VariantProps<typeof heading3Variants> {}

export const Heading3 = React.forwardRef<HTMLHeadingElement, Heading3Props>(
  ({ className, variant, ...props }, ref) => (
    <h3 ref={ref} className={cn(heading3Variants({ variant }), className)} {...props} />
  )
);
Heading3.displayName = 'Heading3';

// Body - Default paragraph text (16px)
const bodyVariants = cva('leading-7 text-foreground transition-colors', {
  variants: {
    variant: {
      default: '',
      muted: 'text-muted-foreground',
    },
  },
  defaultVariants: {
    variant: 'default',
  },
});

export interface BodyProps
  extends React.HTMLAttributes<HTMLParagraphElement>,
    VariantProps<typeof bodyVariants> {}

export const Body = React.forwardRef<HTMLParagraphElement, BodyProps>(
  ({ className, variant, ...props }, ref) => (
    <p ref={ref} className={cn(bodyVariants({ variant }), className)} {...props} />
  )
);
Body.displayName = 'Body';

// BodyLarge - Emphasized paragraphs (18px)
const bodyLargeVariants = cva('text-lg leading-relaxed text-foreground transition-colors', {
  variants: {
    variant: {
      default: '',
      muted: 'text-muted-foreground',
    },
  },
  defaultVariants: {
    variant: 'default',
  },
});

export interface BodyLargeProps
  extends React.HTMLAttributes<HTMLParagraphElement>,
    VariantProps<typeof bodyLargeVariants> {}

export const BodyLarge = React.forwardRef<HTMLParagraphElement, BodyLargeProps>(
  ({ className, variant, ...props }, ref) => (
    <p ref={ref} className={cn(bodyLargeVariants({ variant }), className)} {...props} />
  )
);
BodyLarge.displayName = 'BodyLarge';

// BodySmall - De-emphasized text (14px)
const bodySmallVariants = cva('text-sm leading-relaxed transition-colors', {
  variants: {
    variant: {
      default: 'text-foreground',
      muted: 'text-muted-foreground',
    },
  },
  defaultVariants: {
    variant: 'muted',
  },
});

export interface BodySmallProps
  extends React.HTMLAttributes<HTMLParagraphElement>,
    VariantProps<typeof bodySmallVariants> {}

export const BodySmall = React.forwardRef<HTMLParagraphElement, BodySmallProps>(
  ({ className, variant, ...props }, ref) => (
    <p ref={ref} className={cn(bodySmallVariants({ variant }), className)} {...props} />
  )
);
BodySmall.displayName = 'BodySmall';

// Caption - Metadata, timestamps (12px)
const captionVariants = cva('text-xs leading-relaxed text-muted-foreground transition-colors', {
  variants: {
    variant: {
      default: '',
      strong: 'font-medium text-foreground',
    },
  },
  defaultVariants: {
    variant: 'default',
  },
});

export interface CaptionProps
  extends React.HTMLAttributes<HTMLParagraphElement>,
    VariantProps<typeof captionVariants> {}

export const Caption = React.forwardRef<HTMLParagraphElement, CaptionProps>(
  ({ className, variant, ...props }, ref) => (
    <p ref={ref} className={cn(captionVariants({ variant }), className)} {...props} />
  )
);
Caption.displayName = 'Caption';

// Label - Form labels, UI labels (14px)
const labelVariants = cva('text-sm font-medium transition-colors', {
  variants: {
    variant: {
      default: 'text-foreground',
      muted: 'text-muted-foreground',
    },
  },
  defaultVariants: {
    variant: 'default',
  },
});

export interface LabelProps
  extends React.LabelHTMLAttributes<HTMLLabelElement>,
    VariantProps<typeof labelVariants> {}

export const Label = React.forwardRef<HTMLLabelElement, LabelProps>(
  ({ className, variant, ...props }, ref) => (
    <label ref={ref} className={cn(labelVariants({ variant }), className)} {...props} />
  )
);
Label.displayName = 'Label';
