import { useState, useEffect, useCallback } from 'react';
import { open as openDialog } from '@tauri-apps/plugin-dialog';
import { listen } from '@tauri-apps/api/event';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert } from '@/components/ui/alert';
import { useCreateSession, useDockerStatus } from '@/hooks';
import type { NewSessionFormData, SessionFormErrors } from '@/types';
import { validateSessionForm } from '@/lib/validation';
import { logger } from '@/utils/logger';
import { SessionCreationProgress } from '@/components/SessionCreationProgress';
import type { SessionProgressEvent } from '@/types/session';

interface NewSessionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const initialFormData: NewSessionFormData = {
  name: '',
  local_repo_path: '',
  base_branch: 'main',
};

/**
 * NewSessionDialog - Modal dialog for creating a new development session
 *
 * @param open - Controls dialog visibility
 * @param onOpenChange - Callback to handle dialog open/close state
 *
 * Features:
 * - Form validation with field-level error display
 * - Docker availability check with warning banner
 * - Step-by-step progress indicator during session creation
 * - Auto-close and form reset on success
 * - Accessible form with proper labels and ARIA attributes
 */
export function NewSessionDialog({ open, onOpenChange: onOpenChangeProp }: NewSessionDialogProps) {
  const [formData, setFormData] = useState<NewSessionFormData>(initialFormData);
  const [errors, setErrors] = useState<SessionFormErrors>({});
  const [progressEvent, setProgressEvent] = useState<SessionProgressEvent | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  const createSession = useCreateSession();
  const { data: dockerAvailable } = useDockerStatus();

  // Stabilize onOpenChange callback to prevent effect re-runs that cancel the auto-close timeout
  const onOpenChange = useCallback(onOpenChangeProp, [onOpenChangeProp]);

  // Listen for progress events - only when dialog is open
  useEffect(() => {
    // Only set up listener when dialog is open
    if (!open) {
      logger.debug('[NewSessionDialog] Dialog not open, skipping listener setup');
      return;
    }

    let unlisten: (() => void) | undefined;
    let isMounted = true;

    logger.debug('[NewSessionDialog] Dialog opened, setting up progress listener');

    const setupListener = async () => {
      logger.debug('[NewSessionDialog] setupListener: Starting listener setup');
      unlisten = await listen<SessionProgressEvent>('session-progress', (event) => {
        logger.debug('[NewSessionDialog] Event received', {
          isMounted,
          status: event.payload.status,
          message: event.payload.message,
          step: event.payload.step,
        });

        if (!isMounted) {
          logger.debug('[NewSessionDialog] Component unmounted, ignoring event');
          return;
        }

        logger.debug('[NewSessionDialog] Processing event, updating state', {
          status: event.payload.status,
        });
        setProgressEvent(event.payload);
        setIsCreating(true);

        // Close dialog immediately when session is ready
        // Per design principles (Principle 10: Calm Technology):
        // "No notification when session becomes ready (users can see in UI)"
        // The session appearing in the list with status="ready" is the feedback
        if (event.payload.status === 'ready') {
          logger.debug('[NewSessionDialog] Ready status detected, closing dialog', {
            isMounted,
          });
          setProgressEvent(null);
          setIsCreating(false);
          logger.debug('[NewSessionDialog] Calling onOpenChangeProp(false)');
          // Call onOpenChangeProp directly to close the dialog
          // This bypasses handleClose which would block closing while isCreating state updates batch
          onOpenChangeProp(false);
          logger.debug('[NewSessionDialog] Dialog close triggered');
        }
      });
      logger.debug('[NewSessionDialog] setupListener: Listener setup complete', {
        hasUnlisten: !!unlisten,
      });
    };

    setupListener();

    return () => {
      logger.debug('[NewSessionDialog] Cleanup: Removing event listener');
      isMounted = false;
      if (unlisten) {
        logger.debug('[NewSessionDialog] Cleanup: Calling unlisten');
        unlisten();
      }
    };
  }, [open, onOpenChangeProp]);

  const handleChange =
    (field: keyof NewSessionFormData) => (e: React.ChangeEvent<HTMLInputElement>) => {
      setFormData((prev) => ({ ...prev, [field]: e.target.value }));
      // Clear error for this field when user types
      if (errors[field]) {
        setErrors((prev) => ({ ...prev, [field]: undefined }));
      }
    };

  const handleBrowse = async () => {
    const selected = await openDialog({
      directory: true,
      multiple: false,
      title: 'Select Repository Directory',
    });

    if (selected && typeof selected === 'string') {
      setFormData((prev) => ({ ...prev, local_repo_path: selected }));
      // Clear error for this field
      if (errors.local_repo_path) {
        setErrors((prev) => ({ ...prev, local_repo_path: undefined }));
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    logger.debug('[NewSessionDialog] handleSubmit called', { formData });

    // Validate form
    const validationErrors = validateSessionForm(formData);
    if (validationErrors) {
      setErrors(validationErrors);
      logger.debug('Form validation failed', validationErrors as Record<string, unknown>);
      return;
    }

    // Check Docker availability
    if (!dockerAvailable) {
      setErrors({ general: 'Docker is not available. Please start Docker and try again.' });
      logger.debug('[NewSessionDialog] Docker not available');
      return;
    }

    // Submit
    try {
      logger.debug('[NewSessionDialog] Submitting form to createSession');
      await createSession.mutateAsync(formData);
      logger.debug('[NewSessionDialog] createSession completed');
      // Reset form and close dialog on success
      setFormData(initialFormData);
      setErrors({});
      logger.debug('[NewSessionDialog] handleSubmit calling onOpenChange(false)');
      onOpenChange(false);
    } catch (error) {
      // Error toast is handled by the hook
      logger.error('Failed to create session', error as Error);
    }
  };

  const handleClose = () => {
    logger.debug('[NewSessionDialog] handleClose called', { isCreating });
    if (!isCreating) {
      logger.debug('[NewSessionDialog] handleClose: Not creating, allowing close');
      setFormData(initialFormData);
      setErrors({});
      setProgressEvent(null);
      onOpenChange(false);
    } else {
      logger.debug('[NewSessionDialog] handleClose: Still creating, blocking close');
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Create New Session</DialogTitle>
          <DialogDescription>
            Create a new isolated development session with Docker container.
          </DialogDescription>
        </DialogHeader>

        {!dockerAvailable && (
          <Alert variant="warning" title="Docker is not running">
            Please start Docker Desktop before creating a session.
          </Alert>
        )}

        {/* Progress indicator - step-by-step display */}
        {isCreating && progressEvent && (
          <SessionCreationProgress
            currentStatus={progressEvent.status}
            message={progressEvent.message}
            currentStep={progressEvent.step}
            totalSteps={progressEvent.total_steps}
          />
        )}

        <form onSubmit={handleSubmit}>
          <div className="space-y-6 py-6">
            {/* General Error */}
            {errors.general && <Alert variant="error">{errors.general}</Alert>}

            {/* Session Name */}
            <div className="space-y-2">
              <Label htmlFor="name" className="text-sm font-normal text-foreground">
                Session Name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="name"
                tabIndex={1}
                placeholder="e.g., feature-auth-refactor"
                value={formData.name}
                onChange={handleChange('name')}
                aria-invalid={!!errors.name}
                aria-describedby={errors.name ? 'name-error' : undefined}
              />
              {errors.name && (
                <p id="name-error" className="text-sm text-destructive">
                  {errors.name}
                </p>
              )}
            </div>

            {/* Repository Path */}
            <div className="space-y-2">
              <Label htmlFor="repo-path" className="text-sm font-normal text-foreground">
                Repository Path <span className="text-destructive">*</span>
              </Label>
              <div className="flex gap-2">
                <Input
                  id="repo-path"
                  placeholder="Click Browse to select directory"
                  value={formData.local_repo_path}
                  readOnly
                  aria-invalid={!!errors.local_repo_path}
                  aria-describedby={errors.local_repo_path ? 'repo-path-error' : undefined}
                  className="flex-1"
                />
                <Button type="button" variant="outline" onClick={handleBrowse} tabIndex={2}>
                  Browse
                </Button>
              </div>
              {errors.local_repo_path && (
                <p id="repo-path-error" className="text-sm text-destructive">
                  {errors.local_repo_path}
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                Select a local Git repository directory
              </p>
            </div>

            {/* Base Branch */}
            <div className="space-y-2">
              <Label htmlFor="branch" className="text-sm font-normal text-foreground">
                Base Branch <span className="text-destructive">*</span>
              </Label>
              <Input
                id="branch"
                tabIndex={3}
                placeholder="main"
                value={formData.base_branch}
                onChange={handleChange('base_branch')}
                aria-invalid={!!errors.base_branch}
                aria-describedby={errors.base_branch ? 'branch-error' : undefined}
              />
              {errors.base_branch && (
                <p id="branch-error" className="text-sm text-destructive">
                  {errors.base_branch}
                </p>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleClose} tabIndex={4}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={createSession.isPending || !dockerAvailable}
              tabIndex={5}
            >
              {createSession.isPending ? 'Creating...' : 'Create Session'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
