use crate::models::{NewTask, Task};
use crate::state::AppState;
use tauri::State;

/// Get all tasks for a project
#[tauri::command]
pub async fn get_project_tasks(
    project_id: String,
    state: State<'_, AppState>,
) -> Result<Vec<Task>, String> {
    state
        .db
        .get_project_tasks(&project_id)
        .await
        .map_err(|e| format!("Failed to get tasks: {e}"))
}

/// Create a new task
#[tauri::command]
pub async fn create_task(new_task: NewTask, state: State<'_, AppState>) -> Result<Task, String> {
    state
        .db
        .create_task(new_task)
        .await
        .map_err(|e| format!("Failed to create task: {e}"))
}

/// Update task status
#[tauri::command]
pub async fn update_task_status(
    task_id: String,
    status: String,
    state: State<'_, AppState>,
) -> Result<Task, String> {
    state
        .db
        .update_task_status(&task_id, &status)
        .await
        .map_err(|e| format!("Failed to update task status: {e}"))
}

/// Delete a task (soft delete)
#[tauri::command]
pub async fn delete_task(task_id: String, state: State<'_, AppState>) -> Result<(), String> {
    state
        .db
        .delete_task(&task_id)
        .await
        .map_err(|e| format!("Failed to delete task: {e}"))
}
