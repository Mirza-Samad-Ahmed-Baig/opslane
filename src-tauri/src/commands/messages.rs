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
    // For image blocks: format as @"path" or @"data:..."
    let mut message_parts = Vec::new();

    for block in content_blocks {
        match block {
            ContentBlockInput::Text { text } => {
                message_parts.push(text);
            }
            ContentBlockInput::Image { source } => {
                // Format as @"path" or @"data:image/..." depending on source type
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
                            message_parts.push(format!("@\"{data}\""));
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
