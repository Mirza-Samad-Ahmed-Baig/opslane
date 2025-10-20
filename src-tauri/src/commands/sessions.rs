use crate::models::{NewSession, Session};
use crate::state::AppState;
use chrono::Utc;
use tauri::{AppHandle, Emitter, State};

/// Create a new session with Docker container
///
/// Phase 1 Optimistic UI: Creates session in DB immediately, then spawns background task
/// for container setup and initial message sending. This eliminates race conditions and
/// provides instant feedback to the user.
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

    // Store initial_message for background task
    let initial_message = new_session.initial_message.clone();

    // 1. Create session record in DB immediately (fast, ~10ms)
    //    This includes the initial_message field for optimistic UI display
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

    // 2. Spawn background task for container setup and message sending
    let session_id = session.id.clone();
    let session_manager = state.session_manager.clone();
    let claude_service = state.claude_service.clone();
    let db = state.db.clone(); // BLOCKER FIX: Clone DB for error handling
    let app_handle_clone = app_handle.clone();

    tokio::spawn(async move {
        log::info!("Background task started for session {session_id}");

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

        // Send initial message if provided
        if let Some(message) = initial_message {
            log::info!(
                "Sending initial message for session {}: {} chars",
                session_id,
                message.len()
            );

            match claude_service.send_message(&session_id, message).await {
                Ok(mut receiver) => {
                    // ✅ CRITICAL FIX: Forward ALL stream events to frontend
                    // Previously we were draining events without forwarding them
                    let event_channel = format!("message-stream-{session_id}");

                    while let Some(event) = receiver.recv().await {
                        // Forward event to frontend
                        if let Err(e) = app_handle_clone.emit(&event_channel, &event) {
                            log::warn!("Failed to emit stream event to frontend: {e}");
                        }

                        // Check for errors
                        if let crate::services::claude_service::StreamEvent::Error { message } =
                            event
                        {
                            log::error!(
                                "Claude command failed for session {session_id}: {message}"
                            );
                            let _ = app_handle_clone.emit(
                                "session-error",
                                serde_json::json!({
                                    "session_id": session_id,
                                    "error": format!("Failed to send message: {message}"),
                                }),
                            );
                            return;
                        }
                    }
                    log::info!("Initial message sent successfully for session {session_id}");
                }
                Err(e) => {
                    log::error!("Failed to send initial message for session {session_id}: {e}");
                    let _ = app_handle_clone.emit(
                        "session-error",
                        serde_json::json!({
                            "session_id": session_id,
                            "error": format!("Failed to send message: {e}"),
                        }),
                    );
                }
            }
        }

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
