use crate::database::Database;
use crate::services::docker_service::{DockerService, WORKSPACE_PATH};
use anyhow::{anyhow, Result};
use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use serde_json::Value as JsonValue;
use std::sync::Arc;
use tokio::sync::mpsc;

/// Events emitted during Claude message streaming
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum StreamEvent {
    /// Text chunk from Claude's response
    #[serde(rename = "text_delta")]
    TextDelta { content: String },

    /// Tool use started
    #[serde(rename = "tool_use")]
    ToolUse { tool_name: String },

    /// Tool execution result
    #[serde(rename = "tool_result")]
    ToolResult { tool_name: String, success: bool },

    /// Error occurred during streaming
    #[serde(rename = "error")]
    Error { message: String },

    /// Message complete
    #[serde(rename = "complete")]
    Complete,
}

/// Parsed message from Claude session file
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ParsedMessage {
    pub id: String,
    pub uuid: String,
    pub parent_uuid: Option<String>,
    pub message_type: String,
    pub role: Option<String>,
    pub content_blocks: Vec<ContentBlock>,
    pub usage: Option<UsageInfo>,
    pub request_id: Option<String>,
    pub session_id: String,
    pub git_branch: Option<String>,
    pub cwd: Option<String>,
    pub is_sidechain: Option<bool>,
}

/// Content block types found in Claude messages
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum ContentBlock {
    #[serde(rename = "text")]
    Text { text: String },

    #[serde(rename = "tool_use")]
    ToolUse {
        id: String,
        name: String,
        input: JsonValue,
    },

    #[serde(rename = "tool_result")]
    ToolResult {
        tool_use_id: String,
        content: String,
        is_error: bool,
    },

    #[serde(rename = "thinking")]
    Thinking {
        thinking: String,
        signature: Option<String>,
    },

    #[serde(rename = "file_history_snapshot")]
    FileHistorySnapshot {
        message_id: String,
        tracked_files: JsonValue,
        is_snapshot_update: bool,
    },
}

/// Token usage information
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UsageInfo {
    pub input_tokens: Option<i64>,
    pub output_tokens: Option<i64>,
    pub cache_creation_input_tokens: Option<i64>,
    pub cache_read_input_tokens: Option<i64>,
}

/// Service for managing Claude Code interactions within Docker containers
pub struct ClaudeService {
    docker: Arc<DockerService>,
    db: Arc<Database>,
}

impl ClaudeService {
    /// Create a new ClaudeService
    pub fn new(docker: Arc<DockerService>, db: Arc<Database>) -> Self {
        Self { docker, db }
    }

    /// Send a message to Claude in a session's container and return streaming response
    ///
    /// # Arguments
    /// * `session_id` - The session ID
    /// * `message` - The message content to send to Claude
    ///
    /// # Returns
    /// Returns a receiver that streams `StreamEvent`s as they occur
    pub async fn send_message(
        &self,
        session_id: &str,
        message: String,
    ) -> Result<mpsc::Receiver<StreamEvent>> {
        // SECURITY: Validate message size to prevent resource exhaustion
        const MAX_MESSAGE_SIZE: usize = 1024 * 1024; // 1MB limit
        if message.len() > MAX_MESSAGE_SIZE {
            return Err(anyhow!(
                "Message too large: {} bytes (max: {} bytes)",
                message.len(),
                MAX_MESSAGE_SIZE
            ));
        }

        // Get session from database
        let session = self
            .db
            .get_session(session_id)
            .await
            .map_err(|e| anyhow!("Failed to get session: {e}"))?;

        // Verify session is ready
        if session.status != "ready" {
            return Err(anyhow!(
                "Session not ready (status: {}). Cannot send message.",
                session.status
            ));
        }

        // Get container ID
        let container_id = session
            .container_id
            .ok_or_else(|| anyhow!("Session has no container ID"))?;

        // Build Claude command
        let mut cmd = vec!["claude".to_string()];

        // Add resume flag if continuing existing session
        if let Some(claude_session_id) = &session.claude_session_id {
            log::info!(
                "Resuming Claude session {claude_session_id} for Opslane session {session_id}"
            );
            cmd.extend_from_slice(&["--resume".to_string(), claude_session_id.clone()]);
        } else {
            log::info!("Starting new Claude session for Opslane session {session_id}");
        }

        // Add common flags
        cmd.extend_from_slice(&[
            "-p".to_string(),
            "--dangerously-skip-permissions".to_string(),
            "--output-format".to_string(),
            "stream-json".to_string(), // CRITICAL: Enables line-by-line streaming
            "--verbose".to_string(),
            message.clone(),
        ]);

        log::info!("Executing Claude command in container {container_id}: {cmd:?}");

        // Update last activity timestamp
        if let Err(e) = self.db.update_session_activity(session_id).await {
            log::warn!("Failed to update session activity: {e}");
        }

        // ✅ NEW: Use exec_command for streaming output (like Opcode does)
        let (_exec_id, stream) = self
            .docker
            .exec_command(&container_id, cmd, Some(WORKSPACE_PATH.to_string()), false)
            .await?;

        // ✅ NEW: Stream Docker stdout directly (like Opcode streams process stdout)
        let db = Arc::clone(&self.db);
        let session_id = session_id.to_string();
        stream_docker_output(session_id, stream, db).await
    }

    /// Get message history for a session by reading Claude's session files
    ///
    /// # Arguments
    /// * `session_id` - The session ID
    ///
    /// # Returns
    /// Returns parsed structured messages from Claude's session file
    pub async fn get_message_history(&self, session_id: &str) -> Result<Vec<ParsedMessage>> {
        let start = std::time::Instant::now();

        // Get session
        let session = self
            .db
            .get_session(session_id)
            .await
            .map_err(|e| anyhow!("Failed to get session: {e}"))?;

        // Phase 1: If container isn't ready yet (background setup still running),
        // return empty array instead of error. The optimistic message will be shown
        // from the DB (session.initial_message) until the container is ready.
        let container_id = match session.container_id {
            Some(id) => id,
            None => {
                log::debug!("Session {session_id} has no container yet (setup in progress), returning empty history");
                return Ok(Vec::new());
            }
        };

        // Claude stores sessions at: ~/.claude/projects/{sanitized-cwd}/{uuid}.jsonl
        // Working directory is /workspace/repo, which becomes -workspace-repo
        // Find the most recent .jsonl file in that directory
        let projects_dir = "/home/claude/.claude/projects/-workspace-repo";

        // List all .jsonl files, sorted by modification time (newest first)
        let cmd = vec![
            "sh".to_string(),
            "-c".to_string(),
            format!("ls -t {}/*.jsonl 2>/dev/null | head -1", projects_dir),
        ];

        let latest_file = self
            .docker
            .exec_command_blocking(&container_id, cmd, None, false)
            .await
            .map_err(|e| anyhow!("Failed to find session file in {projects_dir}: {e}"))?;

        let session_file_path = latest_file.trim();

        if session_file_path.is_empty() {
            // No session file yet - return empty vector
            return Ok(Vec::new());
        }

        // Read the session file
        let cmd = vec!["cat".to_string(), session_file_path.to_string()];

        let output = self
            .docker
            .exec_command_blocking(&container_id, cmd, None, false)
            .await
            .map_err(|e| anyhow!("Failed to read session file {session_file_path}: {e}"))?;

        log::debug!(
            "Retrieved {} bytes of message history for session {session_id}",
            output.len()
        );

        // Parse JSONL content
        let mut messages = Vec::new();
        for line in output.lines() {
            let line = line.trim();
            if line.is_empty() {
                continue;
            }

            match self.parse_jsonl_line(line) {
                Ok(Some(msg)) => messages.push(msg),
                Ok(None) => continue, // Skipped message type
                Err(e) => {
                    log::warn!("Failed to parse message line: {e}");
                }
            }
        }

        let duration = start.elapsed();
        log::info!(
            "Parsed {} messages in {:?} (<10ms target)",
            messages.len(),
            duration
        );

        // Verify performance budget
        if duration.as_millis() > 10 {
            log::warn!(
                "PERFORMANCE: Message parsing took {}ms, exceeds 10ms budget",
                duration.as_millis()
            );
        }

        Ok(messages)
    }

    /// Parse a single JSONL line into a ParsedMessage
    ///
    /// This is a wrapper around the standalone parse_claude_jsonl_line function
    /// to maintain compatibility with existing code that uses this instance method.
    fn parse_jsonl_line(&self, line: &str) -> Result<Option<ParsedMessage>> {
        // Delegate to standalone function (ensures both history and streaming use same logic)
        parse_claude_jsonl_line(line)
    }
}

/// Parse a single JSONL line from Claude session file into ParsedMessage
///
/// This is a standalone function used by both history loading and streaming
/// to ensure consistent message transformation.
///
/// # Arguments
/// * `line` - Raw JSONL line from Claude session file
///
/// # Returns
/// * `Ok(Some(ParsedMessage))` - Successfully parsed displayable message
/// * `Ok(None)` - Message was filtered (non-displayable type)
/// * `Err(_)` - Failed to parse
fn parse_claude_jsonl_line(line: &str) -> Result<Option<ParsedMessage>> {
    let json: JsonValue =
        serde_json::from_str(line).map_err(|e| anyhow!("JSON parse error: {e}"))?;

    let message_type = json
        .get("type")
        .and_then(|v| v.as_str())
        .ok_or_else(|| anyhow!("Missing type field"))?
        .to_string();

    // FILTER: Only parse displayable message types
    // This is the SAME filtering logic used by frontend and backend
    if !matches!(
        message_type.as_str(),
        "user" | "assistant" | "file-history-snapshot"
    ) {
        // Not a displayable type - filter it out
        return Ok(None);
    }

    let uuid = json
        .get("uuid")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();

    let parent_uuid = json
        .get("parentUuid")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());

    // Parse content blocks based on message type
    let content_blocks = match message_type.as_str() {
        "user" | "assistant" => parse_message_content_blocks(&json)?,
        "file-history-snapshot" => parse_file_history_blocks(&json)?,
        _ => Vec::new(),
    };

    // Extract usage info
    let usage = extract_usage_info_from_json(&json);

    Ok(Some(ParsedMessage {
        id: json
            .get("message")
            .and_then(|m| m.get("id"))
            .and_then(|v| v.as_str())
            .unwrap_or(&uuid)
            .to_string(),
        uuid,
        parent_uuid,
        message_type,
        role: json
            .get("message")
            .and_then(|m| m.get("role"))
            .and_then(|v| v.as_str())
            .map(|s| s.to_string()),
        content_blocks,
        usage,
        request_id: json
            .get("requestId")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string()),
        // Check both snake_case and camelCase variants for compatibility
        // Claude CLI outputs snake_case, but we also support camelCase for API compatibility
        session_id: json
            .get("session_id")
            .or_else(|| json.get("sessionId"))
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string(),
        git_branch: json
            .get("gitBranch")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string()),
        cwd: json
            .get("cwd")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string()),
        is_sidechain: json.get("isSidechain").and_then(|v| v.as_bool()),
    }))
}

/// Parse message content blocks from JSON (helper for parse_claude_jsonl_line)
fn parse_message_content_blocks(json: &JsonValue) -> Result<Vec<ContentBlock>> {
    let mut blocks = Vec::new();

    if let Some(content_value) = json.get("message").and_then(|m| m.get("content")) {
        match content_value {
            JsonValue::String(text) => {
                if !text.is_empty() {
                    blocks.push(ContentBlock::Text { text: text.clone() });
                }
            }
            JsonValue::Array(content_array) => {
                for content in content_array {
                    if let Some(block_type) = content.get("type").and_then(|t| t.as_str()) {
                        match block_type {
                            "text" => {
                                if let Some(text) = content.get("text").and_then(|t| t.as_str()) {
                                    blocks.push(ContentBlock::Text {
                                        text: text.to_string(),
                                    });
                                }
                            }
                            "tool_use" => {
                                blocks.push(ContentBlock::ToolUse {
                                    id: content
                                        .get("id")
                                        .and_then(|v| v.as_str())
                                        .unwrap_or("")
                                        .to_string(),
                                    name: content
                                        .get("name")
                                        .and_then(|v| v.as_str())
                                        .unwrap_or("")
                                        .to_string(),
                                    input: content.get("input").cloned().unwrap_or(JsonValue::Null),
                                });
                            }
                            "tool_result" => {
                                blocks.push(ContentBlock::ToolResult {
                                    tool_use_id: content
                                        .get("tool_use_id")
                                        .and_then(|v| v.as_str())
                                        .unwrap_or("")
                                        .to_string(),
                                    content: content
                                        .get("content")
                                        .and_then(|v| v.as_str())
                                        .unwrap_or("")
                                        .to_string(),
                                    is_error: content
                                        .get("is_error")
                                        .and_then(|v| v.as_bool())
                                        .unwrap_or(false),
                                });
                            }
                            "thinking" => {
                                blocks.push(ContentBlock::Thinking {
                                    thinking: content
                                        .get("thinking")
                                        .and_then(|v| v.as_str())
                                        .unwrap_or("")
                                        .to_string(),
                                    signature: content
                                        .get("signature")
                                        .and_then(|v| v.as_str())
                                        .map(|s| s.to_string()),
                                });
                            }
                            _ => {}
                        }
                    }
                }
            }
            _ => {}
        }
    }

    Ok(blocks)
}

/// Parse file history blocks from JSON (helper for parse_claude_jsonl_line)
fn parse_file_history_blocks(json: &JsonValue) -> Result<Vec<ContentBlock>> {
    if let Some(snapshot) = json.get("snapshot") {
        Ok(vec![ContentBlock::FileHistorySnapshot {
            message_id: json
                .get("messageId")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string(),
            tracked_files: snapshot
                .get("trackedFileBackups")
                .cloned()
                .unwrap_or(JsonValue::Object(serde_json::Map::new())),
            is_snapshot_update: json
                .get("isSnapshotUpdate")
                .and_then(|v| v.as_bool())
                .unwrap_or(false),
        }])
    } else {
        Ok(Vec::new())
    }
}

/// Extract usage info from JSON (helper for parse_claude_jsonl_line)
fn extract_usage_info_from_json(json: &JsonValue) -> Option<UsageInfo> {
    let usage = json
        .get("usage")
        .or_else(|| json.get("message").and_then(|m| m.get("usage")));

    usage.map(|u| UsageInfo {
        input_tokens: u.get("input_tokens").and_then(|v| v.as_i64()),
        output_tokens: u.get("output_tokens").and_then(|v| v.as_i64()),
        cache_creation_input_tokens: u
            .get("cache_creation_input_tokens")
            .and_then(|v| v.as_i64()),
        cache_read_input_tokens: u.get("cache_read_input_tokens").and_then(|v| v.as_i64()),
    })
}

/// Stream Docker stdout and emit events in real-time
///
/// This is EXACTLY like how Opcode streams native process stdout, but reading from Docker exec stream
/// instead of a native process pipe.
///
/// # Arguments
/// * `session_id` - The Opslane session ID
/// * `stream` - Docker exec output stream (stdout + stderr)
/// * `db` - Database handle to store claude_session_id when discovered
///
/// # Returns
/// Returns a receiver that emits StreamEvent as JSONL lines are parsed
async fn stream_docker_output(
    session_id: String,
    mut stream: impl futures_util::Stream<Item = Result<String>> + Unpin + Send + 'static,
    db: Arc<Database>,
) -> Result<mpsc::Receiver<StreamEvent>> {
    let (tx, rx) = mpsc::channel(100);

    tokio::spawn(async move {
        let mut line_buffer = String::new();
        const MAX_LINE_LENGTH: usize = 1024 * 1024; // 1MB max per line

        // ✅ Read stream chunk-by-chunk (like Opcode reads stdout)
        while let Some(chunk_result) = stream.next().await {
            match chunk_result {
                Ok(chunk) => {
                    line_buffer.push_str(&chunk);

                    // Protect against unbounded line buffer growth from malformed streams
                    if line_buffer.len() > MAX_LINE_LENGTH {
                        log::error!(
                            "Line buffer exceeded {MAX_LINE_LENGTH} bytes without newline, clearing buffer. \
                            This may indicate a malformed stream."
                        );
                        line_buffer.clear();
                        continue;
                    }

                    // Process complete lines (JSONL is line-delimited)
                    while let Some(newline_pos) = line_buffer.find('\n') {
                        let line = line_buffer[..newline_pos].trim().to_string();
                        line_buffer.drain(..=newline_pos);

                        if line.is_empty() {
                            continue;
                        }

                        log::debug!("Claude stdout line: {line}");

                        // ✅ CRITICAL FIX: Extract session_id from ANY message type BEFORE filtering
                        // System messages contain session_id but get filtered in parse_claude_jsonl_line
                        // We need to extract session_id before that filtering happens
                        if let Ok(json) = serde_json::from_str::<JsonValue>(&line) {
                            // Check both field name variants (snake_case and camelCase)
                            let session_id_value = json
                                .get("session_id")
                                .or_else(|| json.get("sessionId"))
                                .and_then(|v| v.as_str());

                            if let Some(sid) = session_id_value {
                                if !sid.is_empty() {
                                    log::info!("✓ Found session_id in message: {sid}");
                                    if let Err(e) =
                                        db.update_claude_session_id(&session_id, sid).await
                                    {
                                        log::error!(
                                            "Failed to update claude_session_id for {session_id}: {e}. \
                                            This may prevent session resumption."
                                        );
                                    }
                                }
                            }
                        }

                        // Parse JSONL and emit (same as Opcode)
                        match parse_claude_jsonl_line(&line) {
                            Ok(Some(parsed)) => {
                                let msg_type = &parsed.message_type;
                                log::info!("✓ Parsed displayable message type: {msg_type}");

                                // ✅ Emit message immediately (real-time streaming)
                                // Serialize to match frontend expectations
                                match serde_json::to_string(&parsed) {
                                    Ok(json_string) => {
                                        tx.send(StreamEvent::TextDelta {
                                            content: format!("{json_string}\n"),
                                        })
                                        .await
                                        .ok();
                                    }
                                    Err(e) => {
                                        log::error!("✗ Failed to serialize message: {e}");
                                    }
                                }
                            }
                            Ok(None) => {
                                log::debug!("⊘ Filtered non-displayable message type");
                            }
                            Err(e) => {
                                log::error!("✗ Failed to parse JSONL line: {e}");
                            }
                        }
                    }
                }
                Err(e) => {
                    log::error!("Stream error: {e}");
                    tx.send(StreamEvent::Error {
                        message: format!("Stream error: {e}"),
                    })
                    .await
                    .ok();
                    break;
                }
            }
        }

        // Process any remaining partial line
        if !line_buffer.trim().is_empty() {
            if let Ok(Some(parsed)) = parse_claude_jsonl_line(line_buffer.trim()) {
                if let Ok(json_string) = serde_json::to_string(&parsed) {
                    tx.send(StreamEvent::TextDelta {
                        content: format!("{json_string}\n"),
                    })
                    .await
                    .ok();
                }
            }
        }

        // ✅ Stream complete (like Opcode's process exit)
        tx.send(StreamEvent::Complete).await.ok();
        log::info!("Docker stdout streaming complete for session {session_id}");
    });

    Ok(rx)
}
