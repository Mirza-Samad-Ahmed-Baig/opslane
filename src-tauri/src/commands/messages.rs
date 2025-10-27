use crate::state::AppState;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, State};

/// Content block input types for structured message content
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum ContentBlockInput {
    #[serde(rename = "text")]
    Text { text: String },

    #[serde(rename = "image")]
    Image { source: ImageSource },
}

/// Image source for content blocks - properly tagged enum
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum ImageSource {
    #[serde(rename = "path")]
    Path {
        path: String,
        media_type: ImageMediaType,
    },
    #[serde(rename = "base64")]
    Base64 {
        data: String,
        media_type: ImageMediaType,
    },
}

/// Supported image MIME types
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ImageMediaType {
    #[serde(rename = "image/png")]
    Png,
    #[serde(rename = "image/jpeg")]
    Jpeg,
    #[serde(rename = "image/gif")]
    Gif,
    #[serde(rename = "image/webp")]
    WebP,
}

/// Validate image path for security
/// Ensures the path is within the allowed /workspace/images/ directory
/// and doesn't contain path traversal attempts
fn validate_image_path(path: &str) -> bool {
    // Path must start with /workspace/images/
    if !path.starts_with("/workspace/images/") {
        return false;
    }

    // No path traversal attempts
    if path.contains("..") || path.contains("//") {
        return false;
    }

    // No null bytes or other dangerous characters
    if path.contains('\0') || path.contains('\n') || path.contains('\r') {
        return false;
    }

    // Path should not be too long (prevent buffer overflow)
    if path.len() > 1024 {
        return false;
    }

    true
}

/// Validate base64 data URL format
/// Ensures the data starts with valid image data URL prefix
fn validate_base64_data(data: &str) -> bool {
    // Must start with data:image/
    if !data.starts_with("data:image/") {
        return false;
    }

    // Must contain base64 marker
    if !data.contains(";base64,") {
        return false;
    }

    // Size limit: 10MB base64 encoded = ~13.3MB text
    const MAX_BASE64_SIZE: usize = 14_000_000; // 14MB to be safe
    if data.len() > MAX_BASE64_SIZE {
        log::warn!("Base64 data exceeds size limit: {} bytes", data.len());
        return false;
    }

    // Extract the base64 part and validate it's valid base64
    if let Some(base64_part) = data.split(";base64,").nth(1) {
        // Check for valid base64 characters
        base64_part
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '+' || c == '/' || c == '=')
    } else {
        false
    }
}

const TEMP_IMAGE_PREFIX: &str = "temp-";

/// Save base64 image data to a temporary file in the session images directory
///
/// Temporary files are created with a timestamp prefix and cleaned up after 5 minutes.
/// Files are written atomically to prevent corruption.
///
/// # Arguments
/// * `session_id` - The session ID (must be a valid UUID)
/// * `data` - Base64 data URL (e.g., "data:image/png;base64,iVBORw0...")
///
/// # Returns
/// Returns the container path to the saved file (e.g., "/workspace/images/temp-123456-abc.png")
async fn save_base64_to_temp_file(session_id: &str, data: &str) -> Result<String, String> {
    use base64::{engine::general_purpose, Engine as _};
    use std::io::Write;

    // Validate session_id is a valid UUID to prevent directory traversal
    uuid::Uuid::parse_str(session_id)
        .map_err(|_| format!("Invalid session ID format for session {session_id}"))?;

    // Parse data URL format: data:[<mediatype>][;base64],<data>
    // More robust than split() - handles edge cases properly
    if !data.starts_with("data:") {
        return Err(format!(
            "Invalid data URL for session {session_id}: missing 'data:' prefix"
        ));
    }

    let without_prefix = &data[5..]; // Remove "data:"
    let parts: Vec<&str> = without_prefix.splitn(2, ";base64,").collect();

    if parts.len() != 2 {
        return Err(format!(
            "Invalid data URL format for session {session_id}: missing ';base64,' delimiter"
        ));
    }

    let media_type = parts[0];
    let base64_data = parts[1].trim();

    // Map media type to file extension
    let extension = match media_type {
        "image/png" => "png",
        "image/jpeg" | "image/jpg" => "jpg",
        "image/gif" => "gif",
        "image/webp" => "webp",
        _ => {
            return Err(format!(
                "Unsupported media type '{media_type}' for session {session_id}"
            ))
        }
    };

    // Decode base64 in blocking task to avoid blocking async runtime for large images
    let base64_string = base64_data.to_string();
    let image_bytes =
        tokio::task::spawn_blocking(move || general_purpose::STANDARD.decode(base64_string))
            .await
            .map_err(|e| format!("Task join error for session {session_id}: {e}"))?
            .map_err(|e| format!("Failed to decode base64 for session {session_id}: {e}"))?;

    // Generate unique filename with timestamp for cleanup
    let timestamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs();
    let uuid = uuid::Uuid::new_v4();
    let filename = format!("{TEMP_IMAGE_PREFIX}{timestamp}-{uuid}.{extension}");
    let host_path = format!("/tmp/opslane-sessions/{session_id}/images/{filename}");
    let temp_path = format!("{host_path}.tmp");
    let container_path = format!("/workspace/images/{filename}");

    // Ensure directory exists
    if let Some(parent) = std::path::Path::new(&host_path).parent() {
        std::fs::create_dir_all(parent).map_err(|e| {
            format!("Failed to create images directory for session {session_id}: {e}")
        })?;
    }

    // Write atomically: write to .tmp file first, then rename
    let mut file = std::fs::File::create(&temp_path)
        .map_err(|e| format!("Failed to create temp image file for session {session_id}: {e}"))?;

    file.write_all(&image_bytes)
        .map_err(|e| format!("Failed to write image data for session {session_id}: {e}"))?;

    file.sync_all()
        .map_err(|e| format!("Failed to sync image data for session {session_id}: {e}"))?;

    std::fs::rename(&temp_path, &host_path)
        .map_err(|e| format!("Failed to finalize temp image file for session {session_id}: {e}"))?;

    log::info!(
        "✓ Saved base64 image to {host_path} ({} bytes, accessible as {container_path})",
        image_bytes.len()
    );

    // Spawn cleanup task for old temp files (older than 5 minutes)
    let session_id_clone = session_id.to_string();
    tokio::spawn(async move {
        if let Err(e) = cleanup_old_temp_images(&session_id_clone).await {
            log::warn!("Failed to cleanup old temp images for session {session_id_clone}: {e}");
        }
    });

    Ok(container_path)
}

/// Clean up temporary images older than 5 minutes for a session
///
/// This prevents temp file accumulation in long-running sessions with many pasted images.
async fn cleanup_old_temp_images(session_id: &str) -> Result<(), String> {
    let images_dir = format!("/tmp/opslane-sessions/{session_id}/images");
    let max_age_secs = 300; // 5 minutes
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs();

    let dir = match std::fs::read_dir(&images_dir) {
        Ok(d) => d,
        Err(_) => return Ok(()), // Directory doesn't exist, nothing to clean
    };

    for entry in dir.flatten() {
        let path = entry.path();
        let filename = match path.file_name().and_then(|n| n.to_str()) {
            Some(f) => f,
            None => continue,
        };

        // Only process temp files
        if !filename.starts_with(TEMP_IMAGE_PREFIX) {
            continue;
        }

        // Extract timestamp from filename: temp-{timestamp}-{uuid}.{ext}
        let parts: Vec<&str> = filename.split('-').collect();
        if parts.len() < 2 {
            continue;
        }

        if let Ok(timestamp) = parts[1].parse::<u64>() {
            let age = now.saturating_sub(timestamp);
            if age > max_age_secs {
                if let Err(e) = std::fs::remove_file(&path) {
                    log::warn!("Failed to remove old temp file {}: {}", path.display(), e);
                } else {
                    log::debug!("Cleaned up old temp file: {}", path.display());
                }
            }
        }
    }

    Ok(())
}

/// Send a message to Claude and stream the response
///
/// The response is streamed via Tauri events on channel: `message-stream-{session_id}`
///
/// # Arguments
/// * `session_id` - The session ID
/// * `content_blocks` - The message content blocks (text and/or images)
/// * `model` - Optional model to use (e.g., "sonnet", "opus", "haiku")
///
/// # Returns
/// Returns immediately after starting the stream. Listen for events to get the response.
#[tauri::command]
pub async fn send_message(
    session_id: String,
    content_blocks: Vec<ContentBlockInput>,
    model: Option<String>,
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<(), String> {
    log::info!(
        "send_message command: session={}, blocks={}",
        session_id,
        content_blocks.len()
    );

    // Build message string from content blocks
    // For text blocks: use the text directly
    // For image blocks: ALWAYS convert to file paths (Claude CLI only supports file paths, not base64 data URLs)
    let mut message_parts = Vec::new();

    for block in content_blocks {
        match block {
            ContentBlockInput::Text { text } => {
                message_parts.push(text);
            }
            ContentBlockInput::Image { source } => {
                // Claude CLI ONLY supports file paths, not base64 data URLs
                // Convert all images to file paths
                match source {
                    ImageSource::Path { path, .. } => {
                        // Validate path doesn't contain dangerous characters
                        if validate_image_path(&path) {
                            message_parts.push(format!("@\"{path}\""));
                        } else {
                            log::warn!("Invalid image path rejected: {path}");
                        }
                    }
                    ImageSource::Base64 { data, .. } => {
                        // Validate base64 data format
                        if validate_base64_data(&data) {
                            // Convert base64 to temporary file and use file path instead
                            match save_base64_to_temp_file(&session_id, &data).await {
                                Ok(file_path) => {
                                    message_parts.push(format!("@\"{file_path}\""));
                                    log::info!(
                                        "✓ Converted base64 image to file path: {file_path}"
                                    );
                                }
                                Err(e) => {
                                    log::error!("✗ Failed to save base64 image: {e}");
                                }
                            }
                        } else {
                            log::warn!("Invalid base64 data rejected");
                        }
                    }
                }
            }
        }
    }

    let content = message_parts.join(" ");

    log::debug!("Formatted message with {} parts", message_parts.len());

    // Start streaming from ClaudeService
    let mut rx = state
        .claude_service
        .send_message(&session_id, content, model)
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
/// Returns parsed structured messages from Claude's session file
#[tauri::command]
pub async fn get_messages(
    session_id: String,
    state: State<'_, AppState>,
) -> Result<Vec<crate::services::claude_service::ParsedMessage>, String> {
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

/// Cancel an in-progress message generation
///
/// Kills the Claude process running inside the container using pkill.
/// This immediately terminates execution and allows sending new messages.
///
/// # Security
/// - Only kills "claude" process (validated by pkill)
/// - Cannot affect host or other containers
/// - Safe to call even if no process is running (pkill fails silently)
///
/// # Arguments
/// * `session_id` - The session ID
///
/// # Returns
/// Returns Ok(()) if cancellation was successful or if no process was running
#[tauri::command]
pub async fn cancel_message_generation(
    session_id: String,
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<(), String> {
    log::info!("Cancelling message generation for session: {session_id}");

    // Get session to find container_id
    let session = state
        .db
        .get_session(&session_id)
        .await
        .map_err(|e| format!("Failed to get session: {e}"))?;

    let container_id = session
        .container_id
        .ok_or_else(|| "Session has no active container".to_string())?;

    // Kill Claude process inside container using pkill
    // Note: pkill returns non-zero if no process found, which is expected (may have already finished)
    // We ignore errors since cancellation events should be sent regardless
    let _ = state
        .docker
        .exec_command(
            &container_id,
            vec![
                "pkill".to_string(),
                "-KILL".to_string(), // SIGKILL for immediate termination
                "claude".to_string(),
            ],
            None,  // working_dir (not needed)
            None,  // stdin (not needed)
            false, // as_root (not needed)
        )
        .await;

    log::info!("Kill signal sent to Claude process (if running) for session: {session_id}");

    // Emit cancellation event for frontend
    // Note: We only emit Cancelled, not Complete, since the frontend cancellation handler
    // already handles all cleanup (sets isSending=false, calls onStreamComplete, etc.)
    let event_channel = format!("message-stream-{session_id}");
    if let Err(e) = app.emit(
        &event_channel,
        &crate::services::claude_service::StreamEvent::Cancelled,
    ) {
        log::error!("Failed to emit cancellation event: {e}");
    }

    Ok(())
}
