import * as React from 'react';
import { cn } from '@/lib/utils';
import { Input, type InputProps } from './input';
import { AlertCircle } from 'lucide-react';

export interface FormFieldProps extends InputProps {
  label?: string;
  description?: string;
  error?: string;
  required?: boolean;
  containerClassName?: string;
}

/**
 * FormField - Compound component wrapping Input with label, description, and error
 *
 * @param label - Field label text (displays above input)
 * @param description - Helper text (displays below label in muted color)
 * @param error - Error message (displays below input with red color)
 * @param required - Shows asterisk in label, sets aria-required
 * @param containerClassName - Additional classes for wrapper div
 * @param ...inputProps - All Input props (variant, size, state, etc.)
 *
 * Features:
 * - Automatic error state styling when error prop present
 * - Required field indicator (red asterisk)
 * - Accessible with proper ARIA attributes
 * - Follows design system typography and spacing
 * - Error icon with animation
 *
 * Examples:
 * ```tsx
 * <FormField
 *   label="Email"
 *   description="We'll never share your email"
 *   placeholder="you@example.com"
 * />
 *
 * <FormField
 *   label="Password"
 *   required
 *   type="password"
 *   error="Password must be at least 8 characters"
 * />
 *
 * <FormField
 *   label="Username"
 *   variant="filled"
 *   size="lg"
 * />
 * ```
 */
export const FormField = React.forwardRef<HTMLInputElement, FormFieldProps>(
  (
    {
      label,
      description,
      error,
      required,
      containerClassName,
      className,
      id,
      state,
      ...inputProps
    },
    ref
  ) => {
    const generatedId = React.useId();
    const inputId = id || generatedId;
    const descriptionId = description ? `${inputId}-description` : undefined;
    const errorId = error ? `${inputId}-error` : undefined;

    return (
      <div className={cn('space-y-2', containerClassName)}>
        {label && (
          <label htmlFor={inputId} className="block text-sm font-medium text-foreground">
            {label}
            {required && (
              <span className="text-destructive ml-1" aria-label="required">
                *
              </span>
            )}
          </label>
        )}

        {description && (
          <p id={descriptionId} className="text-xs text-muted-foreground leading-relaxed">
            {description}
          </p>
        )}

        <Input
          ref={ref}
          id={inputId}
          className={className}
          state={error ? 'error' : state}
          aria-invalid={error ? 'true' : 'false'}
          aria-describedby={[descriptionId, errorId].filter(Boolean).join(' ') || undefined}
          aria-required={required}
          {...inputProps}
        />

        {error && (
          <div
            id={errorId}
            className="flex items-start gap-2 text-xs text-destructive animate-fadeIn"
            role="alert"
          >
            <AlertCircle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" aria-hidden="true" />
            <span>{error}</span>
          </div>
        )}
      </div>
    );
  }
);

FormField.displayName = 'FormField';
