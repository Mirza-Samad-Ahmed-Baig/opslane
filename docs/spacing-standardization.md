# Spacing Standardization Guide

This document tracks the systematic replacement of arbitrary spacing values with design tokens for consistency and maintainability.

## Design Token Reference

Import from `@/lib/design-tokens`:

```tsx
import { spacing } from '@/lib/design-tokens';
```

### Available Spacing Constants

#### Component Internal Spacing
- `spacing.componentGap` → `gap-2` (8px) - Between related elements (icon + text)
- `spacing.sectionGap` → `gap-4` (16px) - Between sections

#### Container Padding
- `spacing.compactPadding` → `p-3` (12px) - Tight spaces (alerts, badges)
- `spacing.defaultPadding` → `p-4` (16px) - Most containers
- `spacing.spaciousPadding` → `p-6` (24px) - Cards, dialogs

#### Vertical Spacing
- `spacing.stackTight` → `space-y-2` (8px) - Form fields, list items
- `spacing.stackDefault` → `space-y-4` (16px) - Card sections
- `spacing.stackLoose` → `space-y-6` (24px) - Page sections

#### Horizontal Spacing
- `spacing.rowTight` → `space-x-2` (8px) - Button groups
- `spacing.rowDefault` → `space-x-4` (16px) - Form rows

#### Granular Values
- `spacing.gap.xs` → `gap-1` (4px)
- `spacing.gap.sm` → `gap-2` (8px)
- `spacing.gap.md` → `gap-3` (12px)
- `spacing.gap.lg` → `gap-4` (16px)
- `spacing.gap.xl` → `gap-6` (24px)
- `spacing.gap['2xl']` → `gap-8` (32px)

## Standardization Status

### Phase 1 - Core UI Components ✅

- [x] `src/components/ui/button.tsx` - Uses design tokens
- [x] `src/components/ui/card.tsx` - Uses design tokens
- [x] `src/components/ui/alert.tsx` - Uses design tokens
- [x] `src/components/ui/progress.tsx` - Uses design tokens
- [x] `src/components/ui/input.tsx` - Uses design tokens
- [x] `src/components/ui/textarea.tsx` - Uses design tokens
- [x] `src/components/ui/skeleton.tsx` - Uses design tokens
- [x] `src/components/ui/form-field.tsx` - Uses spacing.stackTight (space-y-2)
- [x] `src/components/ui/empty-state.tsx` - Uses design tokens
- [x] `src/components/ui/typography.tsx` - No spacing (typography only)
- [x] `src/components/ui/error-state.tsx` - Uses spacing.componentGap
- [x] `src/components/ui/error-boundary.tsx` - Uses spacing.stackDefault
- [x] `src/components/SessionCard.tsx` - Standardized in Phase 1

### Phase 2 - Application Components 📋

Priority components to update:

#### High Priority
- [ ] `src/components/chat/ChatMessage.tsx` - Message spacing critical for UX
- [ ] `src/components/chat/ChatInput.tsx` - Input area spacing
- [ ] `src/components/SessionList.tsx` - List item spacing
- [ ] `src/components/MessagePanel.tsx` - Panel layout spacing

#### Medium Priority
- [ ] `src/components/DiffViewer.tsx` - Code diff spacing
- [ ] `src/components/chat/ToolMessageGroup.tsx` - Tool message grouping
- [ ] `src/components/ProjectSelector.tsx` - Selector spacing
- [ ] `src/components/SessionSetupProgress.tsx` - Progress UI spacing

#### Lower Priority
- [ ] `src/components/chat/tools/TaskToolWidget.tsx`
- [ ] `src/components/chat/tools/ReadToolWidget.tsx`
- [ ] `src/components/chat/tools/EditToolWidget.tsx`
- [ ] `src/components/chat/tools/BashToolWidget.tsx`
- [ ] `src/components/chat/tools/GenericToolWidget.tsx`
- [ ] `src/components/SyncProgressModal.tsx`
- [ ] `src/components/SyncConfirmDialog.tsx`
- [ ] `src/components/ContainerLogsDialog.tsx`
- [ ] `src/components/SessionStatusBadge.tsx`
- [ ] `src/components/chat/TypingIndicator.tsx`

### Radix UI Components (Already Optimized) ✅
- [x] `src/components/ui/select.tsx` - Radix primitive, spacing follows spec
- [x] `src/components/ui/dialog.tsx` - Radix primitive, spacing follows spec
- [x] `src/components/ui/alert-dialog.tsx` - Radix primitive, spacing follows spec

## Migration Pattern

### Before (Arbitrary Values)
```tsx
<div className="space-y-4 p-6 gap-3">
  <div className="flex gap-2 items-center">
    <Icon />
    <span>Text</span>
  </div>
</div>
```

### After (Design Tokens)
```tsx
import { spacing } from '@/lib/design-tokens';

<div className={cn(spacing.stackDefault, spacing.spaciousPadding, spacing.gap.md)}>
  <div className={cn('flex items-center', spacing.componentGap)}>
    <Icon />
    <span>Text</span>
  </div>
</div>
```

### Direct Usage (When Dynamic)
```tsx
// Still use className directly for one-off spacing
<div className="space-y-4 p-6">
```

## Design System Alignment

All spacing values follow the 4px/8px grid:
- **4px** (gap-1): Minimal spacing, tight groups
- **8px** (gap-2): Component internal (icon + text)
- **12px** (gap-3): Moderate related items
- **16px** (gap-4): Section spacing, default padding
- **24px** (gap-6): Large spacing, spacious padding
- **32px** (gap-8): Very large spacing, page sections

## Benefits of Standardization

1. **Consistency**: All components use the same spacing scale
2. **Maintainability**: Update spacing once in design-tokens.ts
3. **Readability**: Semantic names (componentGap vs gap-2)
4. **Scalability**: Easy to adjust spacing globally
5. **Documentation**: Self-documenting spacing intent

## Next Steps

1. ✅ Phase 1: Core UI components (Complete)
2. 🔄 Phase 2: Application components (In Progress)
3. ⏳ Phase 3: Tool widgets and modals
4. ⏳ Phase 4: Full audit and validation

## Notes

- Radix UI components (Dialog, Select, etc.) use spec-defined spacing - don't modify
- One-off spacing is acceptable for unique layouts
- Focus on high-visibility components first (chat, session list)
- Test spacing changes in both light and dark modes
