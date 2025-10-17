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
    pub timestamp: String,
    pub usage: Option<UsageInfo>,
    pub request_id: Option<String>,
    pub session_id: String,
    pub git_branch: Option<String>,
    pub cwd: Option<String>,
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

        // Build Claude command based on session state:
        // - NEW: Use `claude` to create new session (Phase 3 will capture UUID)
        // - EXISTING: Use `claude --resume <uuid>` to continue specific session
        //
        // Claude stores sessions at: ~/.claude/projects/{sanitized-cwd}/{uuid}.jsonl
        // Note: --verbose is required when using -p with --output-format=stream-json

        let mut cmd = vec!["claude".to_string()];

        // Add resume flag if continuing existing session
        if let Some(claude_session_id) = &session.claude_session_id {
            log::info!(
                "Claude command decision for Opslane session {session_id}: RESUME (claude_session_id: {claude_session_id}, container: {container_id})"
            );
            cmd.extend_from_slice(&["--resume".to_string(), claude_session_id.clone()]);
        } else {
            log::info!(
                "Claude command decision for Opslane session {session_id}: NEW (container: {container_id})"
            );
        }

        // Add common flags (same for both new and existing sessions)
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
        let existing_files = if is_new_session {
            // List existing files before sending command
            list_existing_session_files(&container_id, &self.docker).await?
        } else {
            // Not needed for existing sessions
            std::collections::HashSet::new()
        };

        log::info!("Executing Claude command in container {container_id}: {cmd:?}");

        // Update last activity timestamp
        if let Err(e) = self.db.update_session_activity(session_id).await {
            log::warn!("Failed to update session activity: {e}");
        }

        // Create channel for streaming events
        let (tx, rx) = mpsc::channel::<StreamEvent>(100);

        // Get output stream from container exec
        let (exec_id, output_stream) = self
            .docker
            .exec_command(&container_id, cmd, Some(WORKSPACE_PATH.to_string()), false)
            .await
            .map_err(|e| anyhow!("Failed to execute Claude command: {e}"))?;

        log::debug!("Claude exec instance created: {exec_id}");

        // Spawn task to process stream and emit events
        let db = Arc::clone(&self.db);
        let docker = Arc::clone(&self.docker);
        let session_id_clone = session_id.to_string();
        tokio::spawn(async move {
            Self::process_claude_output(output_stream, tx, db, docker, exec_id, session_id_clone)
                .await;
        });

        // If this is a new session, spawn a task to discover and store Claude's session ID
        if is_new_session {
            let db = Arc::clone(&self.db);
            let docker = Arc::clone(&self.docker);
            let session_id_clone = session_id.to_string();
            let container_id_clone = container_id.clone();
            // Move existing_files directly instead of cloning (more efficient)
            let existing_files_moved = existing_files;

            tokio::spawn(async move {
                // Discover the newly created session file
                match discover_new_session_file(
                    &container_id_clone,
                    &docker,
                    &existing_files_moved,
                    10, // 10 second timeout
                )
                .await
                {
                    Ok(session_file_path) => {
                        log::info!("Found new session file: {session_file_path}");

                        // Extract UUID from filename
                        match extract_uuid_from_path(&session_file_path) {
                            Ok(claude_session_id) => {
                                log::info!(
                                    "Extracted Claude session ID {claude_session_id} for Opslane session {session_id_clone}"
                                );

                                // Store in database
                                if let Err(e) = db
                                    .update_claude_session_id(&session_id_clone, &claude_session_id)
                                    .await
                                {
                                    log::error!(
                                        "Failed to store Claude session ID for session {session_id_clone}: {e}"
                                    );
                                } else {
                                    log::info!(
                                        "Successfully stored Claude session ID {claude_session_id} for Opslane session {session_id_clone}"
                                    );
                                }
                            }
                            Err(e) => {
                                log::error!(
                                    "Failed to extract UUID from session file {session_file_path}: {e}"
                                );
                            }
                        }
                    }
                    Err(e) => {
                        log::error!(
                            "Failed to discover Claude session file for Opslane session {session_id_clone}: {e}"
                        );
                    }
                }
            });
        }

        Ok(rx)
    }

    /// Process Claude's output stream and emit structured events
    async fn process_claude_output(
        mut stream: impl futures_util::Stream<Item = Result<String>> + Unpin,
        tx: mpsc::Sender<StreamEvent>,
        _db: Arc<Database>,
        docker: Arc<DockerService>,
        exec_id: String,
        _session_id: String,
    ) {
        let mut accumulated_text = String::new();
        let mut chunk_count = 0u64;
        let mut total_bytes = 0u64;

        log::debug!("Starting to process Claude output stream for exec {exec_id}");

        while let Some(chunk_result) = stream.next().await {
            match chunk_result {
                Ok(chunk) => {
                    chunk_count += 1;
                    total_bytes += chunk.len() as u64;
                    accumulated_text.push_str(&chunk);

                    // Send text delta event
                    if let Err(e) = tx.send(StreamEvent::TextDelta { content: chunk }).await {
                        log::error!("Failed to send text delta for exec {exec_id}: {e}");
                        break;
                    }
                }
                Err(e) => {
                    log::error!("Stream error for exec {exec_id}: {e}");
                    let _ = tx
                        .send(StreamEvent::Error {
                            message: e.to_string(),
                        })
                        .await;
                    break;
                }
            }
        }

        // Log stream metrics
        log::info!(
            "Claude response complete for exec {exec_id}: {total_bytes} bytes in {chunk_count} chunks"
        );

        // Inspect exec to get exit code and send appropriate completion event
        if let Ok(Some(exit_code)) = docker.inspect_exec(&exec_id).await {
            if exit_code == 0 {
                log::debug!("Claude exec {exec_id} completed successfully (exit code 0)");
                let _ = tx.send(StreamEvent::Complete).await;
            } else {
                log::warn!("Claude exec {exec_id} failed with exit code {exit_code}");
                // Send error event with exit code and output
                let error_msg = format!(
                    "Claude command failed (exit code {}): {}",
                    exit_code,
                    accumulated_text.trim()
                );
                let _ = tx.send(StreamEvent::Error { message: error_msg }).await;
            }
        } else {
            // If we can't get exit code, assume success
            let _ = tx.send(StreamEvent::Complete).await;
        }
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
    fn parse_jsonl_line(&self, line: &str) -> Result<Option<ParsedMessage>> {
        let json: JsonValue =
            serde_json::from_str(line).map_err(|e| anyhow!("JSON parse error: {e}"))?;

        let message_type = json
            .get("type")
            .and_then(|v| v.as_str())
            .ok_or_else(|| anyhow!("Missing type field"))?
            .to_string();

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
            "user" | "assistant" => self.parse_message_content(&json)?,
            "file-history-snapshot" => self.parse_file_history(&json)?,
            _ => Vec::new(),
        };

        // Extract usage info
        let usage = self.extract_usage_info(&json);

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
        }))
    }

    /// Parse message content blocks (text, tool_use, tool_result, thinking)
    fn parse_message_content(&self, json: &JsonValue) -> Result<Vec<ContentBlock>> {
        let mut blocks = Vec::new();

        if let Some(content_array) = json
            .get("message")
            .and_then(|m| m.get("content"))
            .and_then(|c| c.as_array())
        {
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
                        _ => {
                            log::debug!("Unknown content block type: {block_type}");
                        }
                    }
                }
            }
        }

        Ok(blocks)
    }

    /// Parse file history snapshot content
    fn parse_file_history(&self, json: &JsonValue) -> Result<Vec<ContentBlock>> {
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

    /// Extract usage information from message
    fn extract_usage_info(&self, json: &JsonValue) -> Option<UsageInfo> {
        // Check both top-level and nested message.usage
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
