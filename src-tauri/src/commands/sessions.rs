use crate::models::{NewSession, Session};
use crate::state::AppState;
use tauri::{AppHandle, State};

/// Create a new session with Docker container
#[tauri::command]
pub async fn create_session(
    new_session: NewSession,
    state: State<'_, AppState>,
    app_handle: AppHandle,
) -> Result<Session, String> {
    log::info!("Creating session: {}", new_session.name);

    // Store initial_message before creating session (it's consumed by create_session)
    let initial_message = new_session.initial_message.clone();

    let session = state
        .session_manager
        .create_session(new_session, app_handle)
        .await
        .map_err(|e| {
            log::error!("Failed to create session: {e}");
            format!("Failed to create session: {e}")
        })?;

    // If initial_message is provided, send it to Claude
    if let Some(message) = initial_message {
        log::info!(
            "Sending initial message to session {}: {} chars",
            session.id,
            message.len()
        );

        // Send message SYNCHRONOUSLY (wait for completion)
        // We consume the stream receiver but don't need to process it here
        // The Claude CLI writes directly to JSONL, which is what we need
        let mut receiver = state
            .claude_service
            .send_message(&session.id, message)
            .await
            .map_err(|e| {
                log::error!(
                    "Failed to send initial message for session {}: {e}",
                    session.id
                );
                format!("Failed to send initial message: {e}")
            })?;

        // Drain the receiver to ensure command completes
        // We don't need to process events here since frontend will load history
        while receiver.recv().await.is_some() {
            // Consume events until complete
        }

        log::info!(
            "Initial message sent successfully for session {}",
            session.id
        );
    }

    Ok(session)
}

/// Get a single session by ID
#[tauri::command]
pub async fn get_session(
    session_id: String,
    state: State<'_, AppState>,
) -> Result<Session, String> {
    log::debug!("Fetching session: {session_id}");

    state
        .session_manager
        .get_session(&session_id)
        .await
        .map_err(|e| {
            log::error!("Failed to get session {session_id}: {e}");
            format!("Failed to get session: {e}")
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

/// Get container logs for a session
#[tauri::command]
pub async fn get_container_logs(
    session_id: String,
    state: State<'_, AppState>,
) -> Result<String, String> {
    log::debug!("Fetching logs for session: {session_id}");

    state
        .session_manager
        .get_container_logs(&session_id)
        .await
        .map_err(|e| {
            log::error!("Failed to get logs for {session_id}: {e}");
            format!("Failed to get logs: {e}")
        })
}
