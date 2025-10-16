/**
 * Project model matching Rust struct from src-tauri/src/models/project.rs
 */
export interface Project {
  id: string;
  session_id: string;
  name: string;
  description: string | null;
  order_index: number;
  created_at: string;
  updated_at: string;
  is_deleted: boolean;
}

/**
 * Payload for creating a new project
 * Maps to Rust NewProject struct
 */
export interface NewProject {
  session_id: string;
  name: string;
  description?: string;
}
