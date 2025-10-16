use crate::state::AppState;
use tauri::{AppHandle, Emitter, State};

/// Send a message to Claude and stream the response
///
/// The response is streamed via Tauri events on channel: `message-stream-{session_id}`
///
/// # Arguments
/// * `session_id` - The session ID
/// * `content` - The message content to send
///
/// # Returns
/// Returns immediately after starting the stream. Listen for events to get the response.
#[tauri::command]
pub async fn send_message(
    session_id: String,
    content: String,
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<(), String> {
    log::info!("send_message command: session={}, content_len={}", session_id, content.len());

    // Start streaming from ClaudeService
    let mut rx = state
        .claude_service
        .send_message(&session_id, content)
        .await
        .map_err(|e| {
            log::error!("Failed to send message: {e}");
            format!("Failed to send message: {e}")
        })?;

    // Spawn task to relay stream events to frontend
    let event_channel = format!("message-stream-{session_id}");
    tokio::spawn(async move {
        while let Some(event) = rx.recv().await {
            if let Err(e) = app.emit(&event_channel, &event) {
                log::error!("Failed to emit stream event: {e}");
                break;
            }
        }
        log::debug!("Message stream complete for session {session_id}");
    });

    Ok(())
}

/// Get message history for a session
///
/// # Arguments
/// * `session_id` - The session ID
///
/// # Returns
/// Returns the raw JSONL content from Claude's session file
/// TODO Phase 3: Return parsed structured messages
#[tauri::command]
pub async fn get_messages(
    session_id: String,
    state: State<'_, AppState>,
) -> Result<String, String> {
    log::info!("get_messages command: session={session_id}");

    state
        .claude_service
        .get_message_history(&session_id)
        .await
        .map_err(|e| {
            log::error!("Failed to get message history: {e}");
            format!("Failed to get message history: {e}")
        })
}
