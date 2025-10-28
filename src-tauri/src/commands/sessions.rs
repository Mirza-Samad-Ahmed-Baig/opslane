use crate::models::{NewSession, Session};
use crate::state::AppState;
use chrono::Utc;
use tauri::{AppHandle, Emitter, State};

/// Create a new session with Docker container
///
/// Optimistic UI: Creates session in DB immediately, then spawns background task
/// for container setup. Initial messages are now sent separately through the
/// send_message command after the session becomes ready.
#[tauri::command]
pub async fn create_session(
    project_id: String,
    new_session: NewSession,
    state: State<'_, AppState>,
    app_handle: AppHandle,
) -> Result<Session, String> {
    log::info!(
        "Creating session: {} for project: {}",
        new_session.name,
        project_id
    );

    // Validate project_id matches new_session.project_id
    if new_session.project_id != project_id {
        return Err("Project ID mismatch".to_string());
    }

    // 1. Create session record in DB immediately (fast, ~10ms)
    let session = state.db.create_session(new_session).await.map_err(|e| {
        log::error!("Failed to create session in DB: {e}");
        format!("Failed to create session: {e}")
    })?;

    log::info!(
        "Session {} created in DB with status={}",
        session.id,
        session.status
    );

    // Emit session-created event for frontend to update session list
    let _ = app_handle.emit(
        "session-created",
        serde_json::json!({
            "session_id": session.id,
            "timestamp": Utc::now().to_rfc3339(),
        }),
    );

    // 2. Spawn background task for container setup
    let session_id = session.id.clone();
    let session_manager = state.session_manager.clone();
    let db = state.db.clone(); // BLOCKER FIX: Clone DB for error handling
    let app_handle_clone = app_handle.clone();

    tokio::spawn(async move {
        log::info!("Background task: Setting up container for session {session_id}");

        // Setup container (emits progress events)
        if let Err(e) = session_manager
            .setup_container(&session_id, &app_handle_clone)
            .await
        {
            log::error!("Container setup failed for session {session_id}: {e}");

            // Update database to reflect error state with error message
            if let Err(db_err) = db.update_session_error(&session_id, &e.to_string()).await {
                log::error!("Failed to update session error: {db_err}");
            }

            // Emit session-status-changed event for frontend hooks
            let _ = app_handle_clone.emit(
                "session-status-changed",
                serde_json::json!({
                    "session_id": &session_id,
                    "status": "error",
                    "timestamp": Utc::now().to_rfc3339(),
                }),
            );

            // Emit error event to frontend (for error details)
            let _ = app_handle_clone.emit(
                "session-error",
                serde_json::json!({
                    "session_id": session_id,
                    "error": e.to_string(),
                }),
            );
            return;
        }

        log::info!("Container setup complete for session {session_id}");
        log::info!("Background task complete for session {session_id}");
    });

    // 3. Return session immediately (frontend can navigate and show optimistic message)
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

/// List all sessions for a specific project
#[tauri::command]
pub async fn list_sessions_by_project(
    project_id: String,
    state: State<'_, AppState>,
) -> Result<Vec<Session>, String> {
    state
        .db
        .list_sessions_by_project(&project_id)
        .await
        .map_err(|e| format!("Failed to list sessions: {e}"))
}

/// Delete a session and cleanup its container
#[tauri::command]
pub async fn delete_session(
    session_id: String,
    state: State<'_, AppState>,
    app_handle: AppHandle,
) -> Result<(), String> {
    log::info!("Deleting session: {session_id}");

    state
        .session_manager
        .delete_session(&session_id)
        .await
        .map_err(|e| {
            log::error!("Failed to delete session {session_id}: {e}");
            format!("Failed to delete session: {e}")
        })?;

    // Emit session-deleted event for frontend to update session list
    let _ = app_handle.emit(
        "session-deleted",
        serde_json::json!({
            "session_id": session_id,
            "timestamp": Utc::now().to_rfc3339(),
        }),
    );

    Ok(())
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

/// Archive a session (stops sync if active, stops container, marks as archived)
#[tauri::command]
pub async fn archive_session(
    session_id: String,
    state: State<'_, AppState>,
    app_handle: AppHandle,
) -> Result<(), String> {
    log::info!("Archiving session: {session_id}");

    state
        .session_manager
        .archive_session(&session_id)
        .await
        .map_err(|e| {
            log::error!("Failed to archive session {session_id}: {e}");
            format!("Failed to archive session: {e}")
        })?;

    // Emit session-archived event for frontend to update session list
    let _ = app_handle.emit(
        "session-archived",
        serde_json::json!({
            "session_id": session_id,
            "timestamp": Utc::now().to_rfc3339(),
        }),
    );

    Ok(())
}

/// Unarchive a session (marks as unarchived, restarts container)
#[tauri::command]
pub async fn unarchive_session(
    session_id: String,
    state: State<'_, AppState>,
    app_handle: AppHandle,
) -> Result<(), String> {
    log::info!("Unarchiving session: {session_id}");

    state
        .session_manager
        .unarchive_session(&session_id)
        .await
        .map_err(|e| {
            log::error!("Failed to unarchive session {session_id}: {e}");
            format!("Failed to unarchive session: {e}")
        })?;

    // Emit session-unarchived event for frontend to update session list
    let _ = app_handle.emit(
        "session-unarchived",
        serde_json::json!({
            "session_id": session_id,
            "timestamp": Utc::now().to_rfc3339(),
        }),
    );

    Ok(())
}
