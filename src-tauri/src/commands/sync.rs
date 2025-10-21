use crate::models::SyncResult;
use crate::services::SessionManager;
use std::sync::Arc;
use tauri::{State, Window};

/// Sync changed files from session container to project directory
#[tauri::command]
pub async fn sync_session_to_project(
    session_id: String,
    session_manager: State<'_, Arc<SessionManager>>,
    window: Window,
) -> Result<SyncResult, String> {
    session_manager
        .sync_back_to_project(&session_id, &window)
        .await
        .map_err(|e| e.to_string())
}
