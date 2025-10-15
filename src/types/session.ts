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
  general?: string; // For non-field-specific errors (e.g., Docker unavailability)
}
