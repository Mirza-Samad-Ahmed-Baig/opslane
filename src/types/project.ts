import type { Session } from './session';

/**
 * Project model matching Rust struct from src-tauri/src/models/project.rs
 */
export interface Project {
  id: string;
  name: string; // Folder name (e.g., "opslane")
  local_repo_path: string; // Full path (e.g., "/Users/me/opslane")
  last_opened_at: string | null; // ISO 8601 timestamp
  created_at: string;
  updated_at: string;
  is_deleted: boolean;
}

/**
 * Payload for creating a new project
 * Maps to Rust NewProject struct
 */
export interface NewProject {
  name: string;
  local_repo_path: string;
}

/**
 * Project with session count (for UI display)
 */
export interface ProjectWithSessions extends Project {
  session_count: number;
  sessions?: Session[]; // Optional, populated when grouping
}
