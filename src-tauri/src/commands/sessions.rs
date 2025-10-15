use crate::models::{NewSession, Session};
use crate::state::AppState;
use tauri::State;

/// Create a new session with Docker container
#[tauri::command]
pub async fn create_session(
    new_session: NewSession,
    state: State<'_, AppState>,
) -> Result<Session, String> {
    log::info!("Creating session: {}", new_session.name);

    state
        .session_manager
        .create_session(new_session)
        .await
        .map_err(|e| {
            log::error!("Failed to create session: {e}");
            format!("Failed to create session: {e}")
        })
}

/// List all active sessions
#[tauri::command]
pub async fn list_sessions(state: State<'_, AppState>) -> Result<Vec<Session>, String> {
    log::debug!("Listing sessions");

    state.session_manager.list_sessions().await.map_err(|e| {
        log::error!("Failed to list sessions: {e}");
        format!("Failed to list sessions: {e}")
    })
}

/// Delete a session and cleanup its container
#[tauri::command]
pub async fn delete_session(session_id: String, state: State<'_, AppState>) -> Result<(), String> {
    log::info!("Deleting session: {session_id}");

    state
        .session_manager
        .delete_session(&session_id)
        .await
        .map_err(|e| {
            log::error!("Failed to delete session {session_id}: {e}");
            format!("Failed to delete session: {e}")
        })
}

/// Check if Docker is available
#[tauri::command]
pub async fn check_docker(state: State<'_, AppState>) -> Result<bool, String> {
    state
        .docker
        .check_available()
        .await
        .map_err(|e| format!("Docker check failed: {e}"))
}
