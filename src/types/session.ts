/**
 * Session status lifecycle: created → ready (or error)
 */
export type SessionStatus = 'created' | 'cloning' | 'ready' | 'error';

/**
 * Session model matching Rust struct from src-tauri/src/models/session.rs
 */
export interface Session {
  id: string;
  name: string;
  local_repo_path: string;
  base_branch: string;
  container_id: string | null;
  container_name: string | null;
  container_branch: string | null;
  status: SessionStatus;
  error_message: string | null;
  created_at: string; // ISO 8601 timestamp
  updated_at: string; // ISO 8601 timestamp
  is_deleted: boolean;
}

/**
 * Payload for creating a new session
 * Maps to Rust NewSession struct
 */
export interface NewSession {
  name: string;
  local_repo_path: string;
  base_branch: string;
  initial_message?: string; // Optional initial message to send to Claude
}

/**
 * Form state for new session dialog
 * Type alias for NewSession
 */
export type NewSessionFormData = NewSession;

/**
 * Validation errors for session form
 */
export interface SessionFormErrors {
  name?: string;
  local_repo_path?: string;
  base_branch?: string;
  initial_message?: string; // For initial message validation
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
