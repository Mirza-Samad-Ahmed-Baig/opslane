import type { NewSessionFormData, SessionFormErrors } from '@/types';

/**
 * Validate new session form data
 * Returns errors object or null if valid
 */
export function validateSessionForm(data: NewSessionFormData): SessionFormErrors | null {
  const errors: SessionFormErrors = {};

  // Name validation
  if (!data.name.trim()) {
    errors.name = 'Session name is required';
  } else if (data.name.length > 100) {
    errors.name = 'Session name must be 100 characters or less';
  } else if (!/^[a-zA-Z0-9\s\-_]+$/.test(data.name)) {
    errors.name =
      'Session name can only contain letters, numbers, spaces, hyphens, and underscores';
  }

  // Repository path validation
  if (!data.local_repo_path.trim()) {
    errors.local_repo_path = 'Repository path is required';
  } else if (!data.local_repo_path.startsWith('/')) {
    errors.local_repo_path = 'Path must be absolute (start with /)';
  }

  // Branch validation
  if (!data.base_branch.trim()) {
    errors.base_branch = 'Branch name is required';
  } else if (
    !/^[a-zA-Z0-9]([a-zA-Z0-9\-_]*[a-zA-Z0-9])?(\/[a-zA-Z0-9]([a-zA-Z0-9\-_]*[a-zA-Z0-9])?)*$/.test(
      data.base_branch
    )
  ) {
    errors.base_branch = 'Invalid branch name format (e.g., main, feature/auth)';
  }

  return Object.keys(errors).length > 0 ? errors : null;
}
