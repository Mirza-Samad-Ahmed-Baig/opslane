use crate::database::Database;
use crate::services::docker_service::{DockerService, WORKSPACE_PATH};
use anyhow::{anyhow, Result};
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
    pub timestamp: String,
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
            "stream-json".to_string(),
            "--verbose".to_string(),
            message.clone(),
        ]);

        // Track if this is a new session (needs session ID discovery)
        let is_new_session = session.claude_session_id.is_none();

        log::info!("Executing Claude command in container {container_id}: {cmd:?}");

        // Update last activity timestamp
        if let Err(e) = self.db.update_session_activity(session_id).await {
            log::warn!("Failed to update session activity: {e}");
        }

        // Execute Claude command in background (don't capture stdout)
        // We'll tail the session file instead
        let docker = Arc::clone(&self.docker);
        let container_id_clone = container_id.clone();
        tokio::spawn(async move {
            // Execute command and ignore result (Claude runs in background)
            match docker
                .exec_command_blocking(
                    &container_id_clone,
                    cmd,
                    Some(WORKSPACE_PATH.to_string()),
                    false,
                )
                .await
            {
                Ok(output) => {
                    log::debug!(
                        "Claude command completed, output length: {} bytes",
                        output.len()
                    );
                }
                Err(e) => {
                    log::error!("Claude command failed: {e}");
                }
            }
        });

        // Create channel for streaming events
        let (tx, rx) = mpsc::channel::<StreamEvent>(100);

        // If new session, discover session file first
        if is_new_session {
            let db = Arc::clone(&self.db);
            let docker = Arc::clone(&self.docker);
            let session_id_clone = session_id.to_string();
            let container_id_clone = container_id.clone();
            let tx_clone = tx.clone();

            tokio::spawn(async move {
                // Wait for session file to be created
                // (Claude takes a moment to initialize and create the file)
                tokio::time::sleep(tokio::time::Duration::from_millis(500)).await;

                // List existing files before discovering new one
                let existing_files =
                    match list_existing_session_files(&container_id_clone, &docker).await {
                        Ok(files) => files,
                        Err(e) => {
                            log::error!("Failed to list session files: {e}");
                            let _ = tx_clone
                                .send(StreamEvent::Error {
                                    message: format!("Failed to discover session file: {e}"),
                                })
                                .await;
                            return;
                        }
                    };

                // Wait for new file to appear
                match discover_new_session_file(&container_id_clone, &docker, &existing_files, 10)
                    .await
                {
                    Ok(session_file_path) => {
                        log::info!("Discovered session file: {session_file_path}");

                        // Extract UUID from filename
                        match extract_uuid_from_path(&session_file_path) {
                            Ok(claude_session_id) => {
                                log::info!("Extracted Claude session ID: {claude_session_id}");

                                // Store in database
                                if let Err(e) = db
                                    .update_claude_session_id(&session_id_clone, &claude_session_id)
                                    .await
                                {
                                    log::error!("Failed to store Claude session ID: {e}");
                                }

                                // Convert container path to host path
                                // Container: /home/claude/.claude/projects/-workspace-repo/{uuid}.jsonl
                                // Host: ~/.claude/projects/-workspace-repo/{uuid}.jsonl
                                let home_dir = std::env::var("HOME")
                                    .or_else(|_| std::env::var("USERPROFILE"))
                                    .expect("Could not determine home directory");

                                let host_path = std::path::PathBuf::from(&home_dir)
                                    .join(".claude/projects/-workspace-repo")
                                    .join(format!("{claude_session_id}.jsonl"));

                                log::info!("Tailing session file on host: {}", host_path.display());

                                // Start tailing the file from the beginning
                                if let Err(e) =
                                    Self::tail_session_file(host_path, tx_clone, 0).await
                                {
                                    log::error!("File tailing failed: {e}");
                                }
                            }
                            Err(e) => {
                                log::error!("Failed to extract UUID: {e}");
                                let _ = tx_clone
                                    .send(StreamEvent::Error {
                                        message: format!("Failed to extract session ID: {e}"),
                                    })
                                    .await;
                            }
                        }
                    }
                    Err(e) => {
                        log::error!("Failed to discover session file: {e}");
                        let _ = tx_clone
                            .send(StreamEvent::Error {
                                message: format!("Failed to discover session file: {e}"),
                            })
                            .await;
                    }
                }
            });
        } else {
            // Existing session - we know the claude_session_id already
            let claude_session_id = session.claude_session_id.unwrap(); // Safe - checked above

            // Build host path to session file
            let home_dir = std::env::var("HOME")
                .or_else(|_| std::env::var("USERPROFILE"))
                .map_err(|_| anyhow!("Could not determine home directory"))?;

            let host_path = std::path::PathBuf::from(&home_dir)
                .join(".claude/projects/-workspace-repo")
                .join(format!("{claude_session_id}.jsonl"));

            log::info!(
                "Tailing existing session file on host: {}",
                host_path.display()
            );

            // Count existing lines to start streaming from new content
            let start_from_line = match tokio::fs::read_to_string(&host_path).await {
                Ok(content) => content.lines().count(),
                Err(_) => 0, // File doesn't exist yet or can't read - start from beginning
            };

            log::debug!("Starting tail from line {start_from_line}");

            // Spawn task to tail file
            tokio::spawn(async move {
                if let Err(e) = Self::tail_session_file(host_path, tx, start_from_line).await {
                    log::error!("File tailing failed: {e}");
                }
            });
        }

        Ok(rx)
    }

    /// Tail a Claude session file and stream parsed messages
    ///
    /// Reads the session file line-by-line as it's appended to, parsing each
    /// complete JSONL line and sending structured events to the frontend.
    ///
    /// # Arguments
    /// * `session_file_path` - Full path to session file on HOST (e.g., "/Users/x/.claude/projects/.../uuid.jsonl")
    /// * `tx` - Channel to send stream events
    /// * `start_from_line` - Line number to start from (0 = beginning, N = resume from line N)
    ///
    /// # Returns
    /// Returns when file stops growing or error occurs
    async fn tail_session_file(
        session_file_path: std::path::PathBuf,
        tx: mpsc::Sender<StreamEvent>,
        start_from_line: usize,
    ) -> Result<()> {
        use tokio::fs::File;
        use tokio::io::{AsyncBufReadExt, BufReader};
        use tokio::time::{sleep, Duration};

        log::info!(
            "Starting to tail session file: {}",
            session_file_path.display()
        );
        log::debug!("Starting from line: {start_from_line}");

        let mut current_line = start_from_line;
        let mut last_size = 0u64;
        let mut no_growth_count = 0u16;
        const MAX_NO_GROWTH_CHECKS: u16 = 600; // 600 checks * 500ms = 5 minutes of no growth (Claude can take time to respond)
        const POLL_INTERVAL_MS: u64 = 500; // Check file every 500ms

        loop {
            // Open file (or wait for it to exist)
            let file = match File::open(&session_file_path).await {
                Ok(f) => f,
                Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
                    // File doesn't exist yet - wait and retry
                    log::debug!("Session file not found yet, waiting...");
                    sleep(Duration::from_millis(POLL_INTERVAL_MS)).await;
                    continue;
                }
                Err(e) => {
                    let err_msg = format!("Failed to open session file: {e}");
                    log::error!("{err_msg}");
                    let _ = tx.send(StreamEvent::Error { message: err_msg }).await;
                    return Err(anyhow!(e));
                }
            };

            // Get file size to detect growth
            let metadata = file.metadata().await?;
            let current_size = metadata.len();

            // Check if file has grown
            if current_size == last_size {
                no_growth_count += 1;
                // Log periodically to help debugging (every 10 seconds)
                if no_growth_count % 20 == 0 {
                    log::debug!(
                        "Still waiting for new content... ({} checks, {} seconds elapsed)",
                        no_growth_count,
                        (no_growth_count as u64 * POLL_INTERVAL_MS) / 1000
                    );
                }
                if no_growth_count >= MAX_NO_GROWTH_CHECKS {
                    log::info!(
                        "Session file stopped growing after {} checks ({} seconds), assuming complete",
                        MAX_NO_GROWTH_CHECKS,
                        (MAX_NO_GROWTH_CHECKS as u64 * POLL_INTERVAL_MS) / 1000
                    );
                    break;
                }
                sleep(Duration::from_millis(POLL_INTERVAL_MS)).await;
                continue;
            }

            // File has grown - reset no-growth counter and read new lines
            log::debug!("File grew from {last_size} to {current_size} bytes, reading new content");
            no_growth_count = 0;
            last_size = current_size;

            let reader = BufReader::new(file);
            let mut lines = reader.lines();

            // Skip lines we've already processed
            let mut line_num = 0usize;
            while line_num < current_line {
                if lines.next_line().await?.is_none() {
                    break; // EOF
                }
                line_num += 1;
            }

            // Read and process new lines
            while let Some(line) = lines.next_line().await? {
                current_line += 1;

                let line = line.trim();
                if line.is_empty() {
                    continue;
                }

                // Parse and transform JSONL line using the SAME logic as get_message_history()
                // This ensures consistency between history loading and streaming
                match parse_claude_jsonl_line(line) {
                    Ok(Some(parsed_message)) => {
                        // Successfully parsed and transformed (filtering already done)
                        log::debug!("Streaming message type: {}", parsed_message.message_type);

                        // Serialize the ParsedMessage back to JSON to send to frontend
                        // This matches the format from get_message_history()
                        match serde_json::to_string(&parsed_message) {
                            Ok(json_string) => {
                                if let Err(e) = tx
                                    .send(StreamEvent::TextDelta {
                                        content: format!("{json_string}\n"),
                                    })
                                    .await
                                {
                                    log::error!("Failed to send message: {e}");
                                    return Err(anyhow!("Stream channel closed"));
                                }
                            }
                            Err(e) => {
                                log::error!("Failed to serialize ParsedMessage: {e}");
                            }
                        }
                    }
                    Ok(None) => {
                        // Message was filtered (returns None for non-displayable types)
                        // This is normal, no need to log
                    }
                    Err(e) => {
                        // Failed to parse - might be malformed JSONL
                        log::warn!("Failed to parse JSONL line: {e}");
                    }
                }
            }

            // Finished reading current content - wait before checking for more
            sleep(Duration::from_millis(POLL_INTERVAL_MS)).await;
        }

        // File stopped growing - send completion event
        log::info!("Session file tailing complete");
        let _ = tx.send(StreamEvent::Complete).await;

        Ok(())
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

        let container_id = session
            .container_id
            .ok_or_else(|| anyhow!("Session has no container"))?;

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

/// Extract UUID from Claude session file path
///
/// # Arguments
/// * `path` - Full path to .jsonl file (e.g., "/home/claude/.claude/projects/-workspace-repo/abc-123.jsonl")
///
/// # Returns
/// The UUID portion of the filename (e.g., "abc-123")
///
/// # Errors
/// Returns error if path doesn't contain a valid filename or UUID format is invalid
fn extract_uuid_from_path(path: &str) -> Result<String> {
    use std::path::Path;

    let path_obj = Path::new(path);
    let filename = path_obj
        .file_stem()
        .and_then(|s| s.to_str())
        .ok_or_else(|| anyhow!("Invalid path: no filename found in {path}"))?;

    // Validate UUID format using the uuid crate
    // Claude uses standard UUIDs in format: "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
    uuid::Uuid::parse_str(filename).map_err(|e| {
        anyhow!(
            "Invalid UUID format in filename '{filename}'. Expected format: XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX. Error: {e}"
        )
    })?;

    Ok(filename.to_string())
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

    let timestamp = json
        .get("timestamp")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();

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
        timestamp,
        usage,
        request_id: json
            .get("requestId")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string()),
        session_id: json
            .get("sessionId")
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

/// Discover newly created Claude session file by polling the projects directory
///
/// Polls the ~/.claude/projects/-workspace-repo directory until a new .jsonl file
/// appears that wasn't in the original list.
///
/// # Arguments
/// * `container_id` - Container to check
/// * `docker` - Docker service for executing commands
/// * `existing_files` - Set of file paths that existed before sending the message
/// * `timeout_secs` - Maximum seconds to wait for new file (default: 10)
///
/// # Returns
/// Path to the newly created .jsonl file
///
/// # Errors
/// Returns error if no new file appears within timeout period
async fn discover_new_session_file(
    container_id: &str,
    docker: &DockerService,
    existing_files: &std::collections::HashSet<String>,
    timeout_secs: u64,
) -> Result<String> {
    use std::time::Duration;
    use tokio::time::{sleep, Instant};

    let projects_dir = "/home/claude/.claude/projects/-workspace-repo";
    let start = Instant::now();
    let timeout = Duration::from_secs(timeout_secs);

    log::debug!("Watching for new session file in {projects_dir}");

    loop {
        // Check if we've exceeded timeout
        if start.elapsed() > timeout {
            return Err(anyhow!(
                "Timeout waiting for Claude to create session file after {timeout_secs} seconds"
            ));
        }

        // List current .jsonl files
        let cmd = vec![
            "sh".to_string(),
            "-c".to_string(),
            format!("ls {}/*.jsonl 2>/dev/null || true", projects_dir),
        ];

        let output = docker
            .exec_command_blocking(container_id, cmd, None, false)
            .await?;

        // Check timeout again after command execution (defensive check)
        if start.elapsed() > timeout {
            return Err(anyhow!(
                "Timeout exceeded during file listing (took {:?})",
                start.elapsed()
            ));
        }

        // Parse output into set of file paths
        let current_files: std::collections::HashSet<String> = output
            .lines()
            .filter(|line| !line.trim().is_empty())
            .map(|line| line.trim().to_string())
            .collect();

        // Find new files (files in current but not in existing)
        let new_files: Vec<String> = current_files.difference(existing_files).cloned().collect();

        if !new_files.is_empty() {
            // Found new file(s) - return the first one
            // (should only ever be one new file per message)
            let new_file = new_files[0].clone();
            log::info!("Discovered new Claude session file: {new_file}");
            return Ok(new_file);
        }

        // Wait 100ms before polling again
        sleep(Duration::from_millis(100)).await;
    }
}

/// List all existing .jsonl files in the Claude projects directory
///
/// # Arguments
/// * `container_id` - Container to check
/// * `docker` - Docker service for executing commands
///
/// # Returns
/// HashSet of full paths to existing .jsonl files
async fn list_existing_session_files(
    container_id: &str,
    docker: &DockerService,
) -> Result<std::collections::HashSet<String>> {
    let projects_dir = "/home/claude/.claude/projects/-workspace-repo";

    let cmd = vec![
        "sh".to_string(),
        "-c".to_string(),
        format!("ls {}/*.jsonl 2>/dev/null || true", projects_dir),
    ];

    let output = docker
        .exec_command_blocking(container_id, cmd, None, false)
        .await?;

    let files: std::collections::HashSet<String> = output
        .lines()
        .filter(|line| !line.trim().is_empty())
        .map(|line| line.trim().to_string())
        .collect();

    log::debug!(
        "Found {} existing session files in {}",
        files.len(),
        projects_dir
    );

    Ok(files)
}
