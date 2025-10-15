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

    state
        .session_manager
        .create_session(new_session, app_handle)
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

/// Open system terminal in container
#[tauri::command]
pub async fn open_container_terminal(
    session_id: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    use std::process::Command;

    log::info!("Opening terminal for session: {session_id}");

    let session = state
        .session_manager
        .get_session(&session_id)
        .await
        .map_err(|e| format!("Failed to get session: {e}"))?;

    let container_id = session
        .container_id
        .ok_or("No container for this session")?;

    // Platform-specific terminal commands
    #[cfg(target_os = "macos")]
    {
        Command::new("osascript")
            .arg("-e")
            .arg(format!(
                "tell application \"Terminal\" to do script \"docker exec -it {container_id} bash\""
            ))
            .spawn()
            .map_err(|e| format!("Failed to open terminal: {e}"))?;
    }

    #[cfg(target_os = "windows")]
    {
        Command::new("cmd")
            .args([
                "/c",
                "start",
                "cmd",
                "/k",
                &format!("docker exec -it {container_id} bash"),
            ])
            .spawn()
            .map_err(|e| format!("Failed to open terminal: {e}"))?;
    }

    #[cfg(target_os = "linux")]
    {
        // Try common terminal emulators
        let terminals = ["gnome-terminal", "konsole", "xterm"];
        let mut success = false;

        for term in terminals {
            if let Ok(_) = Command::new(term)
                .arg("-e")
                .arg(format!("docker exec -it {container_id} bash"))
                .spawn()
            {
                success = true;
                break;
            }
        }

        if !success {
            return Err("No supported terminal found".to_string());
        }
    }

    Ok(())
}
