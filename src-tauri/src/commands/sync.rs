use crate::models::SyncResult;
use crate::state::AppState;
use serde::{Deserialize, Serialize};
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

// ============================================================================
// Two-Way Sync Commands
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EnableSyncRequest {
    pub session_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DisableSyncRequest {
    pub project_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GetSyncStatusRequest {
    pub project_id: String,
}

/// Enable two-way sync for a session (only one at a time)
#[tauri::command]
pub async fn enable_session_sync(
    request: EnableSyncRequest,
    state: State<'_, AppState>,
    window: Window,
) -> Result<(), String> {
    log::info!(
        "Command: enable_session_sync for session {}",
        request.session_id
    );

    state
        .sync_manager
        .enable_sync(&request.session_id, &window)
        .await
        .map_err(|e| {
            log::error!("Failed to enable sync: {e}");
            e.to_string()
        })
}

/// Disable all syncing for a project
#[tauri::command]
pub async fn disable_all_sync(
    request: DisableSyncRequest,
    state: State<'_, AppState>,
    window: Window,
) -> Result<(), String> {
    log::info!(
        "Command: disable_all_sync for project {}",
        request.project_id
    );

    state
        .sync_manager
        .disable_all_sync(&request.project_id, &window)
        .await
        .map_err(|e| {
            log::error!("Failed to disable sync: {e}");
            e.to_string()
        })
}

/// Get current sync status for a project
#[tauri::command]
pub async fn get_sync_status(
    request: GetSyncStatusRequest,
    state: State<'_, AppState>,
) -> Result<crate::services::sync_manager::SyncStatusResponse, String> {
    log::debug!(
        "Command: get_sync_status for project {}",
        request.project_id
    );

    state
        .sync_manager
        .get_sync_status(&request.project_id)
        .await
        .map_err(|e| {
            log::error!("Failed to get sync status: {e}");
            e.to_string()
        })
}

/// Check if a specific session is actively syncing
#[tauri::command]
pub async fn is_session_syncing(
    session_id: String,
    state: State<'_, AppState>,
) -> Result<bool, String> {
    log::debug!("Command: is_session_syncing for session {session_id}");

    Ok(state.sync_manager.is_session_active(&session_id).await)
}
