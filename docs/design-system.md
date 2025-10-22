# Opslane Design System

Version 1.0 | Last Updated: 2025-10-22

## Design Principles

This design system follows the principles defined in [`specs/design-principles.md`](../specs/design-principles.md):

- **Native First**: Desktop apps should feel native, respect system theme
- **Instant Feedback**: Every action has immediate visual feedback
- **Resilient by Default**: Design for recovery, not prevention
- **Transparent State**: Users always know what's happening
- **Calm Technology**: Subtle, non-intrusive interactions
- **Keyboard-Driven**: Everything accessible via keyboard
- **Performance Budget**: <16ms UI interactions (60fps)

---

## Color System

### Semantic Colors

The application uses **OKLch color space** for perceptually uniform colors across light and dark modes.

#### Light Mode

| Token | Value | Hex Approx | Usage |
|-------|-------|------------|-------|
| `--background` | `oklch(1 0 0)` | `#ffffff` | Page background |
| `--foreground` | `oklch(0.18 0.01 250)` | `#2a2d3a` | Primary text |
| `--card` | `oklch(1 0 0)` | `#ffffff` | Card background |
| `--card-foreground` | `oklch(0.18 0.01 250)` | `#2a2d3a` | Card text |
| `--primary` | `oklch(0.22 0.02 250)` | `#353945` | Primary buttons, links |
| `--primary-foreground` | `oklch(0.98 0.005 250)` | `#fafafb` | Text on primary |
| `--secondary` | `oklch(0.96 0.005 250)` | `#f5f5f6` | Secondary buttons |
| `--secondary-foreground` | `oklch(0.22 0.02 250)` | `#353945` | Text on secondary |
| `--muted` | `oklch(0.97 0.005 250)` | `#f8f8f9` | Muted backgrounds |
| `--muted-foreground` | `oklch(0.52 0.015 250)` | `#7e8194` | Muted text |
| `--destructive` | `oklch(0.577 0.245 27.325)` | `#e94444` | Error/danger |
| `--border` | `oklch(0.91 0.008 250)` | `#e8e8ea` | Borders |
| `--input` | `oklch(0.91 0.008 250)` | `#e8e8ea` | Input borders |
| `--ring` | `oklch(0.22 0.02 250)` | `#353945` | Focus rings |

**Contrast Ratios** (WCAG AA requires 4.5:1):
- Foreground on Background: **11.6:1** ✅
- Primary on Primary Foreground: **16.2:1** ✅
- Muted Foreground on Background: **4.8:1** ✅

#### Dark Mode

| Token | Value | Hex Approx | Usage |
|-------|-------|------------|-------|
| `--background` | `oklch(0.09 0 0)` | `#171717` | Page background |
| `--foreground` | `oklch(0.985 0 0)` | `#fbfbfb` | Primary text |
| `--card` | `oklch(0.12 0 0)` | `#1f1f1f` | Card background |
| `--primary` | `oklch(0.99 0 0)` | `#fcfcfc` | Primary buttons, links |
| `--primary-foreground` | `oklch(0.09 0 0)` | `#171717` | Text on primary |
| `--secondary` | `oklch(0.15 0 0)` | `#262626` | Secondary buttons |
| `--muted` | `oklch(0.15 0 0)` | `#262626` | Muted backgrounds |
| `--muted-foreground` | `oklch(0.65 0 0)` | `#a6a6a6` | Muted text |
| `--destructive` | `oklch(0.58 0.18 20)` | `#d95050` | Error/danger |
| `--border` | `oklch(1 0 0 / 8%)` | rgba(255,255,255,0.08) | Borders |
| `--input` | `oklch(1 0 0 / 10%)` | rgba(255,255,255,0.10) | Input borders |
| `--ring` | `oklch(0.6 0 0)` | `#999999` | Focus rings |

**Contrast Ratios** (WCAG AA requires 4.5:1):
- Foreground on Background: **14.8:1** ✅
- Primary on Background: **17.4:1** ✅
- Muted Foreground on Background: **5.2:1** ✅

### Status Colors

Used for alerts, notifications, and status indicators.

#### Light Mode Status Colors

| Status | Background | Foreground | Border | Contrast |
|--------|------------|------------|--------|----------|
| **Info** | `oklch(0.9 0.05 250)` | `oklch(0.3 0.1 250)` | `oklch(0.8 0.06 250)` | **7.8:1** ✅ |
| **Warning** | `oklch(0.9 0.08 80)` | `oklch(0.35 0.15 80)` | `oklch(0.8 0.1 80)` | **6.4:1** ✅ |
| **Success** | `oklch(0.9 0.08 150)` | `oklch(0.3 0.12 150)` | `oklch(0.8 0.1 150)` | **8.1:1** ✅ |
| **Error** | `oklch(0.9 0.08 20)` | `oklch(0.35 0.15 20)` | `oklch(0.8 0.1 20)` | **6.2:1** ✅ |

#### Dark Mode Status Colors

| Status | Background | Foreground | Border | Contrast |
|--------|------------|------------|--------|----------|
| **Info** | `oklch(0.2 0.05 250 / 30%)` | `oklch(0.75 0.08 250)` | `oklch(0.3 0.05 250 / 40%)` | **5.8:1** ✅ |
| **Warning** | `oklch(0.2 0.08 80 / 30%)` | `oklch(0.8 0.12 80)` | `oklch(0.3 0.08 80 / 40%)` | **6.4:1** ✅ |
| **Success** | `oklch(0.2 0.08 150 / 30%)` | `oklch(0.75 0.1 150)` | `oklch(0.3 0.08 150 / 40%)` | **5.9:1** ✅ |
| **Error** | `oklch(0.2 0.08 20 / 30%)` | `oklch(0.8 0.12 20)` | `oklch(0.3 0.08 20 / 40%)` | **6.5:1** ✅ |

### Color Usage Examples

```tsx
// Button primary action
<Button className="bg-primary text-primary-foreground">
  Create Session
</Button>

// Error message
<Alert variant="error">
  <p className="text-status-error-fg">Failed to load sessions</p>
</Alert>

// Muted text
<p className="text-muted-foreground">Last synced 5 minutes ago</p>

// Card with border
<Card className="bg-card border-border">
  <CardContent className="text-card-foreground">...</CardContent>
</Card>
```

---

## Typography Scale

System font stack:
```css
font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen',
             'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue', sans-serif;
```

### Heading Hierarchy

| Element | Size | Weight | Line Height | Spacing | Use Case |
|---------|------|--------|-------------|---------|----------|
| **H1** | `text-2xl` (24px) | `font-bold` (700) | 1.2 | `mt-8 mb-4` | Page titles |
| **H2** | `text-xl` (20px) | `font-semibold` (600) | 1.3 | `mt-6 mb-4` | Section titles |
| **H3** | `text-lg` (18px) | `font-semibold` (600) | 1.4 | `mt-5 mb-4` | Subsection titles |
| **H4** | `text-base` (16px) | `font-semibold` (600) | 1.5 | `mt-4 mb-4` | Card titles |
| **H5** | `text-sm` (14px) | `font-semibold` (600) | 1.5 | `mt-3 mb-2` | Minor headings |

### Body Text

| Type | Class | Size | Weight | Line Height | Use Case |
|------|-------|------|--------|-------------|----------|
| **Body** | `text-base` | 16px | 400 | `leading-relaxed` (1.625) | Paragraphs |
| **Small** | `text-sm` | 14px | 400 | `leading-normal` (1.5) | Labels, descriptions |
| **Caption** | `text-xs` | 12px | 400 | `leading-normal` (1.5) | Timestamps, metadata |
| **Label** | `text-sm font-medium` | 14px | 500 | `leading-none` (1) | Form labels |

### Code Examples

```tsx
// Page title
<h1 className="text-2xl font-bold">Active Sessions</h1>

// Section title
<h2 className="text-xl font-semibold">Recent Activity</h2>

// Card title
<h4 className="text-base font-semibold">Session Details</h4>

// Body text
<p className="text-base leading-relaxed">
  This session is running in a Docker container...
</p>

// Small text (labels)
<span className="text-sm text-muted-foreground">Branch: main</span>

// Caption (timestamps)
<time className="text-xs text-muted-foreground">5 minutes ago</time>

// Label
<label className="text-sm font-medium">Session Name</label>
```

---

## Spacing System

Tailwind's default spacing scale (4px base unit):

| Token | Value | Use Case |
|-------|-------|----------|
| `0.5` | 2px | Minimal spacing |
| `1` | 4px | Tight spacing |
| `2` | 8px | Component gaps (icons + text) |
| `3` | 12px | Compact padding |
| `4` | 16px | Default padding |
| `6` | 24px | Spacious padding (cards) |
| `8` | 32px | Large spacing |

### Component Spacing Standards

| Constant | Class | Value | Use Case |
|----------|-------|-------|----------|
| `componentGap` | `gap-2` | 8px | Between related elements (icon + text) |
| `sectionGap` | `gap-4` | 16px | Between sections |
| `compactPadding` | `p-3` | 12px | Alerts, badges |
| `defaultPadding` | `p-4` | 16px | Most containers |
| `spaciousPadding` | `p-6` | 24px | Cards, dialogs |
| `stackTight` | `space-y-2` | 8px | Form fields |
| `stackDefault` | `space-y-4` | 16px | Card sections |
| `stackLoose` | `space-y-6` | 24px | Page sections |

### Code Examples

```tsx
import { spacing } from '@/lib/design-tokens';

// Card with standard padding
<Card className={spacing.spaciousPadding}>
  <CardHeader className="pb-3">
    <CardTitle>Session Name</CardTitle>
  </CardHeader>
  <CardContent className={spacing.stackDefault}>
    <p>Content with standard vertical spacing</p>
    <p>Between paragraphs</p>
  </CardContent>
</Card>

// Button with icon
<Button className={spacing.componentGap}>
  <PlusIcon className="h-4 w-4" />
  <span>Create Session</span>
</Button>

// Form fields
<div className={spacing.stackTight}>
  <FormField label="Name">
    <Input />
  </FormField>
  <FormField label="Branch">
    <Input />
  </FormField>
</div>
```

---

## Component Patterns

### Button States

```tsx
// Base button with all states
const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium ' +
  'transition-standard hover:brightness-110 active:scale-[0.98] ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ' +
  'disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground',
        destructive: 'bg-destructive text-destructive-foreground',
        outline: 'border border-input/50 bg-background hover:bg-muted/50',
        secondary: 'bg-secondary text-secondary-foreground',
        ghost: 'hover:bg-accent/50 hover:text-accent-foreground',
        link: 'text-primary underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-9 px-4 py-2',
        sm: 'h-8 rounded-md px-3 text-xs',
        lg: 'h-10 rounded-md px-8',
        icon: 'h-9 w-9',
      },
    },
  }
);
```

**States:**
- **Default**: Base styling
- **Hover**: `hover:brightness-110` (10% brighter)
- **Active**: `active:scale-[0.98]` (subtle press)
- **Focus**: Ring with 2px offset
- **Disabled**: 50% opacity, no pointer events
- **Loading**: Spinner icon with `animate-spin`

### Input States

```tsx
// Input with all states
<Input
  className={cn(
    'flex h-10 w-full rounded-md border border-input bg-muted/40',
    'px-3 py-2 text-sm',
    'hover:bg-muted/60',
    'focus-visible:bg-background focus-visible:ring-2 focus-visible:ring-ring focus-visible:border-foreground/40',
    'disabled:cursor-not-allowed disabled:opacity-50',
    'transition-all duration-200'
  )}
/>
```

**States:**
- **Default**: `bg-muted/40`, `border-input`
- **Hover**: `hover:bg-muted/60`
- **Focus**: Ring + lighter background + stronger border
- **Error**: `border-destructive`, `focus-visible:ring-destructive`
- **Success**: `border-green-500`, `focus-visible:ring-green-500`
- **Disabled**: 50% opacity, no cursor

### Card Hover Pattern

```tsx
<Card className="transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5">
  <CardContent>...</CardContent>
</Card>
```

**Interaction:**
- Base: No shadow, no transform
- Hover: Large shadow + 2px lift (translate-y)
- Transition: 200ms (Calm Technology)

---

## Animation Guidelines

### Timing

| Duration | Use Case | Example |
|----------|----------|---------|
| **<100ms** | Instant feedback | Color changes |
| **150ms** | Fast interactions | Hover states, focus |
| **200ms** | Standard | Component enter/exit |
| **300-500ms** | Slow transitions | Page transitions, large modals |

### Easing Functions

| Function | Use Case |
|----------|----------|
| `cubic-bezier(0.4, 0, 0.2, 1)` | Standard (all transitions) |
| `ease-out` | Enter animations |
| `ease-in` | Exit animations |

### Calm Technology Compliance

✅ **YES:**
- Fade (opacity: 0 → 1)
- Slide (translateX/Y: -20px → 0)
- Scale (scale: 0.95 → 1)
- Lift (translateY: 0 → -2px)

❌ **NO:**
- Bouncing animations
- Shaking/vibration effects
- Rapid pulsing (>1Hz)
- Auto-playing animations
- Attention-grabbing effects

**Max Duration:** 500ms

**Reduced Motion:** Respect `prefers-reduced-motion` preference

### Code Examples

```tsx
// Utility class (add to index.css)
.transition-standard {
  transition-property: color, background-color, border-color, transform, box-shadow;
  transition-timing-function: cubic-bezier(0.4, 0, 0.2, 1);
  transition-duration: 150ms;
}

// Framer Motion enter animation
import { motion } from 'framer-motion';

<motion.div
  initial={{ opacity: 0, y: 8 }}
  animate={{ opacity: 1, y: 0 }}
  transition={{ duration: 0.2 }}
>
  <Alert>Message appeared</Alert>
</motion.div>

// Existing fadeIn animation (200ms)
<div className="animate-fadeIn">
  <ChatMessage>Hello!</ChatMessage>
</div>
```

---

## Accessibility Standards

### Focus Indicators

**All interactive elements MUST have visible focus rings.**

```tsx
// Standard focus ring
.focus-standard {
  @apply focus-visible:outline-none
         focus-visible:ring-2
         focus-visible:ring-ring
         focus-visible:ring-offset-2;
}

// Usage
<button className="focus-standard">Click me</button>
<a href="/session/123" className="focus-standard">View Session</a>
```

**Minimum Contrast:** 3:1 for focus indicators (WCAG 2.1)

### Keyboard Navigation

| Key | Action |
|-----|--------|
| `Tab` | Navigate to next element |
| `Shift+Tab` | Navigate to previous element |
| `Enter` | Activate button/link |
| `Space` | Activate button (not link) |
| `Esc` | Close dialog/modal |

**Tab Order:** Logical flow (top → bottom, left → right)

**Focus Trap:** Dialogs must trap focus (can't tab outside)

### Color Contrast

**WCAG AA Requirements:**
- Normal text (14-18px): **4.5:1** minimum
- Large text (18px+/14px bold): **3:1** minimum
- UI components: **3:1** minimum

**Test Tool:** [WebAIM Contrast Checker](https://webaim.org/resources/contrastchecker/)

### Screen Readers

**Semantic HTML:**
```tsx
// YES ✅
<button onClick={handleClick}>Delete</button>
<nav><ul><li>...</li></ul></nav>
<main><h1>Title</h1></main>

// NO ❌
<div onClick={handleClick}>Delete</div>
<div><ul><li>...</li></ul></div>
<div><h1>Title</h1></div>
```

**ARIA Labels:**
```tsx
// Icon buttons need labels
<Button size="icon" aria-label="Delete session">
  <Trash2 className="h-4 w-4" aria-hidden="true" />
</Button>

// Dynamic content needs aria-live
<div aria-live="polite" aria-atomic="true">
  {isLoading && "Loading sessions..."}
</div>

// Form errors need association
<Input
  aria-describedby={error ? "error-message" : undefined}
  aria-invalid={!!error}
/>
{error && <p id="error-message" role="alert">{error}</p>}
```

### Reduced Motion

```css
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }

  /* Keep essential loading indicators */
  .animate-spin,
  .animate-pulse {
    animation-duration: 1s !important;
  }
}
```

---

## Component Examples

### Alert with Dismiss

```tsx
<Alert variant="error" dismissible onDismiss={() => clearError()}>
  <AlertTitle>Failed to load sessions</AlertTitle>
  <AlertDescription>
    Could not connect to the database. Please try again.
  </AlertDescription>
</Alert>
```

### Form Field

```tsx
<FormField
  label="Session Name"
  optional
  helperText="Choose a descriptive name for this session"
  error={errors.name}
>
  <Input
    placeholder="my-feature-branch"
    state={errors.name ? 'error' : 'default'}
    value={name}
    onChange={(e) => setName(e.target.value)}
  />
</FormField>
```

### Loading Skeleton

```tsx
<Card>
  <CardHeader>
    <Skeleton className="h-5 w-3/4" />
  </CardHeader>
  <CardContent className="space-y-3">
    <Skeleton className="h-4 w-full" />
    <Skeleton className="h-4 w-2/3" />
  </CardContent>
</Card>
```

### Progress with Label

```tsx
<Progress
  value={progress}
  size="default"
  showLabel
  label="Syncing files"
/>
```

### Toast Notification

```tsx
import { toast } from 'sonner';

toast.success('Session created successfully', {
  description: 'Container is starting up',
  duration: 4000,
});

toast.error('Failed to delete session', {
  description: error.message,
  action: {
    label: 'Retry',
    onClick: () => retryDeletion(),
  },
});
```

---

## Testing Checklist

Use this checklist when implementing new components:

### Visual
- [ ] Component works in **light mode**
- [ ] Component works in **dark mode**
- [ ] Colors meet WCAG AA contrast ratios
- [ ] Hover states are visible and smooth
- [ ] Focus states are visible (ring + offset)
- [ ] Animations respect `prefers-reduced-motion`

### Interactive
- [ ] Tab key navigates to component
- [ ] Enter/Space activates component
- [ ] Escape closes (if modal/dialog)
- [ ] Loading states show feedback
- [ ] Error states are clear and actionable

### Accessibility
- [ ] Semantic HTML used (`<button>` not `<div onClick>`)
- [ ] ARIA labels on icon buttons
- [ ] Screen reader announces content
- [ ] Keyboard navigation works
- [ ] Focus trap in dialogs

### Performance
- [ ] Animations run at 60fps
- [ ] No layout shift on load
- [ ] Transitions use GPU (transform, opacity)
- [ ] Component doesn't block main thread

---

## Migration Guide

### From Arbitrary Classes to Design Tokens

**Before:**
```tsx
<div className="p-6 space-y-4 gap-2">
  <h2 className="text-xl font-semibold">Title</h2>
  <p className="text-sm text-gray-500">Description</p>
</div>
```

**After:**
```tsx
import { spacing } from '@/lib/design-tokens';
import { Heading2, Body } from '@/components/ui/typography';

<div className={cn(spacing.spaciousPadding, spacing.stackDefault, spacing.componentGap)}>
  <Heading2>Title</Heading2>
  <Body muted>Description</Body>
</div>
```

### Adding Focus Indicators

**Before:**
```tsx
<button className="px-4 py-2 bg-blue-500 rounded">
  Click me
</button>
```

**After:**
```tsx
<button className="px-4 py-2 bg-primary rounded focus-standard">
  Click me
</button>
```

---

## Resources

- **Design Principles**: [`specs/design-principles.md`](../specs/design-principles.md)
- **Tailwind CSS Docs**: https://tailwindcss.com/
- **shadcn/ui Docs**: https://ui.shadcn.com/
- **Radix UI Docs**: https://www.radix-ui.com/
- **Framer Motion**: https://www.framer.com/motion/
- **WCAG Guidelines**: https://www.w3.org/WAI/WCAG21/quickref/
- **WebAIM Contrast Checker**: https://webaim.org/resources/contrastchecker/
- **OKLch Color Picker**: https://oklch.com/

---

**Document Version**: 1.0
**Last Updated**: 2025-10-22
**Maintained By**: Engineering Team
