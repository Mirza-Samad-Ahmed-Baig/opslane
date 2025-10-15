import { useState } from 'react';
import { AlertCircle } from 'lucide-react';
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

export function NewSessionDialog({ open, onOpenChange }: NewSessionDialogProps) {
  const [formData, setFormData] = useState<NewSessionFormData>(initialFormData);
  const [errors, setErrors] = useState<SessionFormErrors>({});

  const createSession = useCreateSession();
  const { data: dockerAvailable } = useDockerStatus();

  const handleChange =
    (field: keyof NewSessionFormData) => (e: React.ChangeEvent<HTMLInputElement>) => {
      setFormData((prev) => ({ ...prev, [field]: e.target.value }));
      // Clear error for this field when user types
      if (errors[field]) {
        setErrors((prev) => ({ ...prev, [field]: undefined }));
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

        <form onSubmit={handleSubmit}>
          <div className="space-y-4 py-4">
            {/* General Error */}
            {errors.general && (
              <div className="flex items-start gap-3 p-3 rounded-md bg-red-50 border border-red-200">
                <AlertCircle className="h-5 w-5 text-red-600 mt-0.5" />
                <p className="text-sm text-red-800">{errors.general}</p>
              </div>
            )}

            {/* Session Name */}
            <div className="space-y-2">
              <Label htmlFor="name">
                Session Name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="name"
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
              <Label htmlFor="repo-path">
                Repository Path <span className="text-destructive">*</span>
              </Label>
              <Input
                id="repo-path"
                placeholder="/Users/you/projects/myapp"
                value={formData.local_repo_path}
                onChange={handleChange('local_repo_path')}
                aria-invalid={!!errors.local_repo_path}
                aria-describedby={errors.local_repo_path ? 'repo-path-error' : undefined}
              />
              {errors.local_repo_path && (
                <p id="repo-path-error" className="text-sm text-destructive">
                  {errors.local_repo_path}
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                Absolute path to your local Git repository
              </p>
            </div>

            {/* Base Branch */}
            <div className="space-y-2">
              <Label htmlFor="branch">
                Base Branch <span className="text-destructive">*</span>
              </Label>
              <Input
                id="branch"
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
            <Button type="button" variant="outline" onClick={handleClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={createSession.isPending || !dockerAvailable}>
              {createSession.isPending ? 'Creating...' : 'Create Session'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
