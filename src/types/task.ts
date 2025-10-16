/**
 * Task status lifecycle: pending → in_progress → completed
 */
export type TaskStatus = 'pending' | 'in_progress' | 'completed';

/**
 * Task model matching Rust struct from src-tauri/src/models/task.rs
 */
export interface Task {
  id: string;
  project_id: string;
  name: string;
  status: TaskStatus;
  order_index: number;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  is_deleted: boolean;
}

/**
 * Payload for creating a new task
 * Maps to Rust NewTask struct
 */
export interface NewTask {
  project_id: string;
  name: string;
}
