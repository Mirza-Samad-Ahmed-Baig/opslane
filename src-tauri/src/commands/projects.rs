use crate::models::{NewProject, Project};
use crate::state::AppState;
use tauri::State;

/// Get all projects for a session
#[tauri::command]
pub async fn get_session_projects(
    session_id: String,
    state: State<'_, AppState>,
) -> Result<Vec<Project>, String> {
    state
        .db
        .get_session_projects(&session_id)
        .await
        .map_err(|e| format!("Failed to get projects: {e}"))
}

/// Create a new project
#[tauri::command]
pub async fn create_project(
    new_project: NewProject,
    state: State<'_, AppState>,
) -> Result<Project, String> {
    state
        .db
        .create_project(new_project)
        .await
        .map_err(|e| format!("Failed to create project: {e}"))
}

/// Delete a project (soft delete)
#[tauri::command]
pub async fn delete_project(project_id: String, state: State<'_, AppState>) -> Result<(), String> {
    state
        .db
        .delete_project(&project_id)
        .await
        .map_err(|e| format!("Failed to delete project: {e}"))
}
