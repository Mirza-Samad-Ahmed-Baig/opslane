import { useEffect, useState } from 'react';
import { listen } from '@tauri-apps/api/event';
import { Loader2, CheckCircle } from 'lucide-react';

interface SetupStep {
  label: string;
  completed: boolean;
}

interface SessionProgressEvent {
  session_id: string;
  status: string;
  message: string;
  step: number;
  total_steps: number;
}

interface SessionSetupProgressProps {
  sessionId: string;
}

/**
 * SessionSetupProgress - Shows progress indicators for container setup
 *
 * Phase 1: Displays each step of container setup with checkmarks as they complete.
 * This provides visual feedback while the background task is running.
 */
export function SessionSetupProgress({ sessionId }: SessionSetupProgressProps) {
  const [steps, setSteps] = useState<SetupStep[]>([
    { label: 'Copying repository', completed: false },
    { label: 'Creating container', completed: false },
    { label: 'Starting container', completed: false },
    { label: 'Configuring credentials', completed: false },
    { label: 'Sending message to Claude', completed: false },
  ]);

  useEffect(() => {
    const setupListener = async () => {
      const unlisten = await listen<SessionProgressEvent>('session-progress', (event) => {
        if (event.payload.session_id !== sessionId) return;

        const stepIndex = event.payload.step - 1;

        // BLOCKER FIX: Mark current step AND all previous steps as completed
        setSteps((prev) =>
          prev.map((step, i) => ({
            ...step,
            completed: i <= stepIndex, // <= instead of < to include current step
          }))
        );
      });

      return unlisten;
    };

    let unlisten: (() => void) | undefined;
    setupListener().then((fn) => {
      unlisten = fn;
    });

    return () => {
      if (unlisten) unlisten();
    };
  }, [sessionId]);

  const currentStep = steps.findIndex((s) => !s.completed);
  const currentStepLabel = currentStep >= 0 ? steps[currentStep]?.label : 'Complete';

  return (
    <div className="space-y-3">
      {/* BLOCKER FIX: ARIA live region for screen readers */}
      <div className="flex items-center gap-2" role="status" aria-live="polite" aria-atomic="true">
        <Loader2 className="h-4 w-4 animate-spin text-primary" aria-hidden="true" />
        <span className="text-sm font-medium">Setting up session... {currentStepLabel}</span>
      </div>

      <div className="space-y-2" aria-label="Setup progress steps">
        {steps.map((step, index) => (
          <div key={index} className="flex items-center gap-2 text-xs">
            {step.completed ? (
              <CheckCircle
                className="h-3 w-3 text-status-success-fg flex-shrink-0"
                aria-hidden="true"
              />
            ) : index === currentStep ? (
              <Loader2
                className="h-3 w-3 animate-spin text-muted-foreground flex-shrink-0"
                aria-hidden="true"
              />
            ) : (
              <div
                className="h-3 w-3 rounded-full border border-muted-foreground/30 flex-shrink-0"
                aria-hidden="true"
              />
            )}
            <span className={step.completed ? 'text-muted-foreground' : ''}>
              {step.label}
              {step.completed && <span className="sr-only"> (completed)</span>}
              {index === currentStep && <span className="sr-only"> (in progress)</span>}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
