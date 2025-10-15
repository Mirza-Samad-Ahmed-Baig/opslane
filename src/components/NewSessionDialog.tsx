import { useState, useEffect } from 'react';
import { open as openDialog } from '@tauri-apps/plugin-dialog';
import { listen } from '@tauri-apps/api/event';
import { AlertCircle, Loader2 } from 'lucide-react';
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
import { useCreateSession, useDockerStatus } from '@/hooks';
import type { NewSessionFormData, SessionFormErrors } from '@/types';
import { validateSessionForm } from '@/lib/validation';
import { logger } from '@/utils/logger';

interface NewSessionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const initialFormData: NewSessionFormData = {
  name: '',
  local_repo_path: '',
  base_branch: 'main',
};

interface ProgressEvent {
  session_id: string;
  status: string;
  message: string;
}

/**
 * NewSessionDialog - Modal dialog for creating a new development session
 *
 * @param open - Controls dialog visibility
 * @param onOpenChange - Callback to handle dialog open/close state
 *
 * Features:
 * - Form validation with field-level error display
 * - Docker availability check with warning banner
 * - Loading state during session creation
 * - Auto-close and form reset on success
 * - Accessible form with proper labels and ARIA attributes
 */
export function NewSessionDialog({ open, onOpenChange }: NewSessionDialogProps) {
  const [formData, setFormData] = useState<NewSessionFormData>(initialFormData);
  const [errors, setErrors] = useState<SessionFormErrors>({});
  const [progressMessage, setProgressMessage] = useState<string | null>(null);

  const createSession = useCreateSession();
  const { data: dockerAvailable } = useDockerStatus();

  // Listen for progress events
  useEffect(() => {
    const setupListener = async () => {
      const unlisten = await listen<ProgressEvent>('session-progress', (event) => {
        setProgressMessage(event.payload.message);

        // Clear progress when done
        if (event.payload.status === 'ready') {
          setTimeout(() => setProgressMessage(null), 1000);
        }
      });

      return unlisten;
    };

    let unlisten: (() => void) | undefined;

    setupListener().then((fn) => {
      unlisten = fn;
    });

    return () => {
      if (unlisten) {
        unlisten();
      }
    };
  }, []);

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
      return;
    }

    // Submit
    try {
      await createSession.mutateAsync(formData);
      // Reset form and close dialog on success
      setFormData(initialFormData);
      setErrors({});
      onOpenChange(false);
    } catch (error) {
      // Error toast is handled by the hook
      logger.error('Failed to create session', error as Error);
    }
  };

  const handleClose = () => {
    setFormData(initialFormData);
    setErrors({});
    onOpenChange(false);
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
          <div className="flex items-start gap-3 p-3 rounded-md bg-yellow-50 border border-yellow-200">
            <AlertCircle className="h-5 w-5 text-yellow-600 mt-0.5" />
            <div className="text-sm text-yellow-800">
              <p className="font-medium">Docker is not running</p>
              <p className="text-yellow-700 mt-1">
                Please start Docker Desktop before creating a session.
              </p>
            </div>
          </div>
        )}

        {/* Progress indicator */}
        {progressMessage && (
          <div className="flex items-center gap-3 p-3 rounded-md bg-blue-50 border border-blue-200">
            <Loader2 className="h-5 w-5 animate-spin text-blue-600" />
            <p className="text-sm text-blue-800">{progressMessage}</p>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="space-y-6 py-6">
            {/* General Error */}
            {errors.general && (
              <div className="flex items-start gap-3 p-3 rounded-md bg-red-50 border border-red-200">
                <AlertCircle className="h-5 w-5 text-red-600 mt-0.5" />
                <p className="text-sm text-red-800">{errors.general}</p>
              </div>
            )}

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
