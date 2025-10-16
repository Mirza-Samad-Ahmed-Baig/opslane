use crate::database::Database;
use crate::services::docker_service::DockerService;
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

        // Get or initialize Claude session ID
        let claude_session_id = if let Some(id) = session.claude_session_id {
            id
        } else {
            // First message - generate new Claude session ID
            let new_id = uuid::Uuid::new_v4().to_string();
            self.db
                .update_claude_session_id(session_id, &new_id)
                .await
                .map_err(|e| anyhow!("Failed to update Claude session ID: {e}"))?;
            log::info!("Initialized Claude session ID: {new_id}");
            new_id
        };

        // Build Claude command
        // Format: claude chat --session-id <id> "<message>"
        let cmd = vec![
            "claude".to_string(),
            "chat".to_string(),
            "--session-id".to_string(),
            claude_session_id.clone(),
            message.clone(),
        ];

        log::info!(
            "Executing Claude command in container {container_id}: {cmd:?}"
        );

        // Update last activity timestamp
        if let Err(e) = self.db.update_session_activity(session_id).await {
            log::warn!("Failed to update session activity: {e}");
        }

        // Create channel for streaming events
        let (tx, rx) = mpsc::channel::<StreamEvent>(100);

        // Get output stream from container exec
        let output_stream = self
            .docker
            .exec_command(&container_id, cmd, Some("/workspace/repo".to_string()))
            .await
            .map_err(|e| anyhow!("Failed to execute Claude command: {e}"))?;

        // Spawn task to process stream and emit events
        let db = Arc::clone(&self.db);
        let session_id = session_id.to_string();
        tokio::spawn(async move {
            Self::process_claude_output(output_stream, tx, db, session_id).await;
        });

        Ok(rx)
    }

    /// Process Claude's output stream and emit structured events
    async fn process_claude_output(
        mut stream: impl futures_util::Stream<Item = Result<String>> + Unpin,
        tx: mpsc::Sender<StreamEvent>,
        _db: Arc<Database>,
        _session_id: String,
    ) {
        let mut accumulated_text = String::new();

        while let Some(chunk_result) = stream.next().await {
            match chunk_result {
                Ok(chunk) => {
                    // For Phase 2, we'll do simple text streaming
                    // TODO Phase 3: Parse Claude's structured output (JSON lines)
                    // TODO Phase 3: Detect tool use events

                    accumulated_text.push_str(&chunk);

                    // Send text delta event
                    if let Err(e) = tx.send(StreamEvent::TextDelta { content: chunk }).await {
                        log::error!("Failed to send text delta: {e}");
                        break;
                    }
                }
                Err(e) => {
                    log::error!("Stream error: {e}");
                    let _ = tx
                        .send(StreamEvent::Error {
                            message: e.to_string(),
                        })
                        .await;
                    break;
                }
            }
        }

        // Send completion event
        let _ = tx.send(StreamEvent::Complete).await;

        // TODO Phase 3: Parse final output and save structured message to JSONL
        // For now, Claude's CLI will handle persistence in /home/claude/.claude/
        log::info!("Claude response complete ({} bytes)", accumulated_text.len());
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

        let claude_session_id = session
            .claude_session_id
            .ok_or_else(|| anyhow!("No Claude session ID - no messages yet"))?;

        // Read Claude's session file from container
        let session_file_path = format!("/home/claude/.claude/sessions/{claude_session_id}/conversation.jsonl");

        let cmd = vec![
            "cat".to_string(),
            session_file_path.clone(),
        ];

        let output = self
            .docker
            .exec_command_blocking(&container_id, cmd, None)
            .await
            .map_err(|e| anyhow!("Failed to read session file {session_file_path}: {e}"))?;

        Ok(output)
    }
}
