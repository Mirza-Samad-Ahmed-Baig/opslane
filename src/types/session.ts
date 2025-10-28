/**
 * Session status lifecycle: created → ready (or error)
 */
export type SessionStatus = 'created' | 'cloning' | 'ready' | 'error';

/**
 * Session model matching Rust struct from src-tauri/src/models/session.rs
 */
export interface Session {
  id: string;
  project_id: string; // NEW: FK to projects
  name: string;
  session_repo_path: string | null;
  base_branch: string;
  container_id: string | null;
  container_name: string | null;
  container_branch: string | null;
  status: SessionStatus;
  error_message: string | null;

  // Session persistence fields
  volume_name: string | null;
  claude_session_id: string | null;
  last_activity_at: string | null;

  // Sync tracking
  last_sync_at?: string;
  sync_status?: 'idle' | 'syncing' | 'synced' | 'error';

  // Two-way sync tracking (only one session active at a time)
  is_sync_active: boolean; // Is two-way sync enabled for this session?
  sync_activated_at?: string; // When was sync enabled?
  sync_deactivated_at?: string; // When was sync last disabled?

  // Archiving fields
  is_archived: boolean; // Whether session is archived
  archived_at?: string; // ISO 8601 timestamp when archived

  created_at: string; // ISO 8601 timestamp
  updated_at: string; // ISO 8601 timestamp
  is_deleted: boolean;
}

/**
 * Payload for creating a new session
 * Maps to Rust NewSession struct
 */
export interface NewSession {
  project_id: string; // NEW: FK to projects
  name: string;
  base_branch: string;
}

/**
 * Form state for new session dialog
 * Keeps local_repo_path for form, which will be resolved to project_id
 */
export type NewSessionFormData = Omit<NewSession, 'project_id'> & {
  local_repo_path: string; // Keep for form, will resolve to project_id
};

/**
 * Validation errors for session form
 */
export interface SessionFormErrors {
  name?: string;
  local_repo_path?: string;
  base_branch?: string;
  general?: string; // For non-field-specific errors (e.g., Docker unavailability)
}

/**
 * Session creation progress statuses
 */
export type SessionCreationStatus =
  | 'copying'
  | 'creating'
  | 'starting'
  | 'configuring'
  | 'ready'
  | 'error';

/**
 * Progress step definition
 */
export interface SessionProgressStep {
  id: SessionCreationStatus;
  label: string;
  description: string;
}

/**
 * Progress event payload from backend
 */
export interface SessionProgressEvent {
  session_id: string;
  status: SessionCreationStatus;
  message?: string;
  step?: number;
  total_steps?: number;
}

/**
 * Predefined session creation steps
 */
export const SESSION_CREATION_STEPS: SessionProgressStep[] = [
  {
    id: 'copying',
    label: 'Preparing Repository',
    description: 'Creating isolated workspace copy',
  },
  {
    id: 'creating',
    label: 'Building Container',
    description: 'Setting up Docker environment',
  },
  {
    id: 'starting',
    label: 'Starting Container',
    description: 'Launching workspace',
  },
  {
    id: 'configuring',
    label: 'Configuring Claude',
    description: 'Setting up credentials',
  },
  {
    id: 'ready',
    label: 'Ready',
    description: 'Session is ready!',
  },
];

/**
 * Duration to display "Ready" state before transitioning (milliseconds)
 */
export const READY_STATE_DISPLAY_MS = 1500;
