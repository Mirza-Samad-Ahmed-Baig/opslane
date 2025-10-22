use crate::models::SyncResult;
use crate::state::AppState;
use tauri::{State, Window};

/// Sync changed files from session container to project directory
#[tauri::command]
pub async fn sync_session_to_project(
    session_id: String,
    state: State<'_, AppState>,
    window: Window,
) -> Result<SyncResult, String> {
    state
        .session_manager
        .sync_back_to_project(&session_id, &window)
        .await
        .map_err(|e| e.to_string())
}
