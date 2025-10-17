use crate::database::Database;
use crate::services::docker_service::{DockerService, WORKSPACE_PATH};
use anyhow::{anyhow, Result};
use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
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

        // Build Claude command using --continue flag
        // Claude automatically manages sessions based on current working directory
        // Sessions are stored in ~/.claude/projects/{sanitized-cwd}/{uuid}.jsonl
        // The working directory will be /workspace/repo, so Claude will create:
        // ~/.claude/projects/-workspace-repo/{uuid}.jsonl
        //
        // Note: --verbose is required when using -p with --output-format=stream-json
        let cmd = vec![
            "claude".to_string(),
            "--continue".to_string(),
            "-p".to_string(),
            "--dangerously-skip-permissions".to_string(),
            "--output-format".to_string(),
            "stream-json".to_string(),
            "--verbose".to_string(),
            message.clone(),
        ];

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
    /// Returns the raw JSONL content from Claude's session file
    /// TODO Phase 3: Parse JSONL and return structured messages
    pub async fn get_message_history(&self, session_id: &str) -> Result<String> {
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
            // No session file yet - return empty JSONL
            return Ok(String::new());
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

        Ok(output)
    }
}
