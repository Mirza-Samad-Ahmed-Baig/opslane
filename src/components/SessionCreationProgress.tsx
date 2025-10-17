import { Loader2, Check } from 'lucide-react';
import { SessionCreationStatus, SESSION_CREATION_STEPS } from '@/types/session';

interface SessionCreationProgressProps {
  currentStatus: SessionCreationStatus;
  message?: string;
  currentStep?: number;
  totalSteps?: number;
}

/**
 * SessionCreationProgress - Step-by-step progress indicator for session creation
 *
 * Displays all session creation steps with visual feedback:
 * - Completed steps: Green checkmark
 * - Current step: Animated spinner with pulsing text
 * - Pending steps: Gray dot
 *
 * Based on Codient's InitializationProgress component pattern.
 */
export function SessionCreationProgress({
  currentStatus,
  message,
  currentStep,
  totalSteps,
}: SessionCreationProgressProps) {
  const currentStepIndex = SESSION_CREATION_STEPS.findIndex((step) => step.id === currentStatus);

  return (
    <div className="py-4 space-y-3">
      {SESSION_CREATION_STEPS.map((step, index) => {
        const isCompleted = index < currentStepIndex;
        const isCurrent = index === currentStepIndex;
        const isPending = index > currentStepIndex;

        return (
          <div
            key={step.id}
            className={`flex items-start gap-3 transition-all duration-300 ${
              isCompleted
                ? 'text-foreground'
                : isCurrent
                  ? 'text-foreground motion-safe:animate-pulse'
                  : 'text-muted-foreground/50'
            }`}
          >
            {/* Icon */}
            <div className="flex-shrink-0 w-6 h-6 flex items-center justify-center">
              {isCompleted && <Check className="h-5 w-5 text-green-600" />}
              {isCurrent && <Loader2 className="h-6 w-6 motion-safe:animate-spin text-primary" />}
              {isPending && <div className="w-2 h-2 rounded-full bg-muted-foreground/30" />}
            </div>

            {/* Step Info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium">{step.label}</p>
                {isCurrent && currentStep && totalSteps && (
                  <span className="text-xs text-muted-foreground">
                    Step {currentStep} of {totalSteps}
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                {isCurrent && message ? message : step.description}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
