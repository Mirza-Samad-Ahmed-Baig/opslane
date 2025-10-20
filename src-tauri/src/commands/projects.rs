use crate::models::Project;
use crate::state::AppState;
use tauri::State;

/// Get or create a project by repository path
/// Returns existing project if path already tracked, otherwise creates new
#[tauri::command]
pub async fn get_or_create_project(
    local_repo_path: String,
    state: State<'_, AppState>,
) -> Result<Project, String> {
    // Validate and canonicalize the path
    let path = std::path::Path::new(&local_repo_path);

    // Security: Ensure the path is absolute
    if !path.is_absolute() {
        return Err("Path must be absolute".to_string());
    }

    // Canonicalize to resolve symlinks and ensure path is valid
    let canonical_path = path
        .canonicalize()
        .map_err(|e| format!("Invalid path: {e}"))?;

    // Ensure it's a directory
    if !canonical_path.is_dir() {
        return Err("Path must be a directory".to_string());
    }

    // Convert back to string
    let canonical_path_str = canonical_path.to_string_lossy().to_string();

    state
        .db
        .get_or_create_project(&canonical_path_str)
        .await
        .map_err(|e| format!("Failed to get or create project: {e}"))
}

/// List all projects ordered by recently opened
#[tauri::command]
pub async fn list_projects(state: State<'_, AppState>) -> Result<Vec<Project>, String> {
    state
        .db
        .list_projects()
        .await
        .map_err(|e| format!("Failed to list projects: {e}"))
}

/// Get a single project by ID
#[tauri::command]
pub async fn get_project(
    project_id: String,
    state: State<'_, AppState>,
) -> Result<Project, String> {
    state
        .db
        .get_project(&project_id)
        .await
        .map_err(|e| format!("Failed to get project: {e}"))
}

/// Delete a project (soft delete, cascades to sessions)
#[tauri::command]
pub async fn delete_project(project_id: String, state: State<'_, AppState>) -> Result<(), String> {
    state
        .db
        .delete_project(&project_id)
        .await
        .map_err(|e| format!("Failed to delete project: {e}"))
}
