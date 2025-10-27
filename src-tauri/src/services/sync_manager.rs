use crate::database::Database;
use crate::services::{ClaudeService, DockerService, SyncWatcher};
use anyhow::{anyhow, Result};
use log::{debug, info, warn};
use serde::Serialize;
use std::collections::HashMap;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::Instant;
use tauri::{Emitter, Window};
use tempfile::NamedTempFile;
use tokio::sync::RwLock;
use tokio::task::JoinHandle;

/// Maximum file size for sync (100MB)
const MAX_SYNC_FILE_SIZE: u64 = 100 * 1024 * 1024;

/// Timeout duration for Claude Code commit operations (2 minutes)
const CLAUDE_COMMIT_TIMEOUT_SECS: u64 = 120;

/// Maximum patch file size for commit copying (5MB)
const MAX_PATCH_SIZE: usize = 5 * 1024 * 1024;

/// Default CPU limit for temporary session manager instances
const DEFAULT_SESSION_CPU_LIMIT: f64 = 1.0;

/// Default memory limit for temporary session manager instances (in MB)
const DEFAULT_SESSION_MEMORY_LIMIT: i64 = 2048;

/// Manages two-way sync between local files and session containers
pub struct SyncManager {
    db: Arc<Database>,
    docker: Arc<DockerService>,
    claude: Arc<ClaudeService>,
    watcher: Arc<SyncWatcher>,
    sync_task: Arc<RwLock<Option<JoinHandle<()>>>>,
    /// Track files recently synced from container→local to prevent sync loops
    recently_synced_files: Arc<RwLock<HashMap<PathBuf, Instant>>>,
}

#[derive(Debug, Clone, Serialize)]
pub struct SyncStatusResponse {
    pub active_session_id: Option<String>,
    pub started_at: Option<String>,
    pub is_active: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CommitResult {
    pub commit_hash: String,
    pub files_changed: usize,
    pub success: bool,
}

impl SyncManager {
    pub fn new(db: Arc<Database>, docker: Arc<DockerService>, claude: Arc<ClaudeService>) -> Self {
        Self {
            db,
            docker,
            claude,
            watcher: Arc::new(SyncWatcher::new()),
            sync_task: Arc::new(RwLock::new(None)),
            recently_synced_files: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    /// Enable sync for a session (only one at a time)
    pub async fn enable_sync(&self, session_id: &str, window: &Window) -> Result<()> {
        info!("Enabling sync for session: {session_id}");

        // Get session and project
        let session = self.db.get_session(session_id).await?;
        let project = self.db.get_project(&session.project_id).await?;

        // Check if another session is active
        if let Some(active_id) = &project.active_sync_session_id {
            if active_id != session_id {
                // Emit warning event (let UI handle confirmation)
                window
                    .emit(
                        "sync-switch-required",
                        serde_json::json!({
                            "current": active_id,
                            "requested": session_id,
                        }),
                    )
                    .ok();

                return Err(anyhow::anyhow!("Another session is currently syncing"));
            }
        }

        // Enable sync
        let now = chrono::Utc::now().to_rfc3339();

        // Use a proper database transaction for atomicity
        let mut tx = self.db.pool().begin().await?;

        // Clear previous active session if exists
        if let Some(old_id) = &project.active_sync_session_id {
            sqlx::query(
                "UPDATE sessions SET is_sync_active = 0, sync_deactivated_at = ?
                 WHERE id = ?",
            )
            .bind(&now)
            .bind(old_id)
            .execute(&mut *tx)
            .await?;
        }

        // Set new active session on project
        sqlx::query(
            "UPDATE projects SET active_sync_session_id = ?, active_sync_started_at = ?
             WHERE id = ?",
        )
        .bind(session_id)
        .bind(&now)
        .bind(&project.id)
        .execute(&mut *tx)
        .await?;

        // Mark session as sync active
        sqlx::query(
            "UPDATE sessions SET is_sync_active = 1, sync_activated_at = ?
             WHERE id = ?",
        )
        .bind(&now)
        .bind(session_id)
        .execute(&mut *tx)
        .await?;

        // Commit the transaction
        tx.commit().await?;

        // Start file watcher
        let project_path = PathBuf::from(&project.local_repo_path);
        let rx = self
            .watcher
            .start_sync(session_id.to_string(), project_path)
            .await?;

        // Cancel any existing sync task
        {
            let mut task_guard = self.sync_task.write().await;
            if let Some(task) = task_guard.take() {
                task.abort();
                debug!("Cancelled previous sync task");
            }
        }

        // Spawn task to handle file events (local → container)
        let docker = self.docker.clone();
        let db = self.db.clone();
        let session_id_clone = session_id.to_string();
        let project_path_clone = PathBuf::from(&project.local_repo_path);
        let window_clone = window.clone();
        let recently_synced_files = self.recently_synced_files.clone();

        log::debug!("🚀 Spawning sync task for session: {session_id}");

        let task_handle = tokio::spawn(async move {
            // Channel for local → container sync
            let mut local_to_container_rx = rx;

            // Periodic interval for container → local sync (every 5 seconds)
            let mut sync_interval = tokio::time::interval(tokio::time::Duration::from_secs(5));
            sync_interval.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);

            // Periodic cleanup of old entries from recently_synced_files map (every 10 seconds)
            let mut cleanup_interval = tokio::time::interval(tokio::time::Duration::from_secs(10));
            cleanup_interval.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);

            loop {
                tokio::select! {
                    // Handle local file changes → push to container
                    Some(event) = local_to_container_rx.recv() => {
                        log::debug!("📥 Received event: {:?}", event.path);

                        // Check if this file was recently synced from container→local
                        let (should_skip, elapsed_ms) = {
                            let synced_map = recently_synced_files.read().await;
                            if let Some(&timestamp) = synced_map.get(&event.path) {
                                let elapsed = timestamp.elapsed();
                                // Skip if synced within last 1 second
                                (elapsed.as_millis() < 1000, elapsed.as_millis())
                            } else {
                                (false, 0)
                            }
                        };

                        if should_skip {
                            log::debug!("⏭️  Skipping recently synced file: {:?} (synced {}ms ago)", event.path, elapsed_ms);
                        } else if let Err(e) = push_file_to_container(
                            &docker,
                            &db,
                            &event.session_id,
                            &event.path,
                            &project_path_clone,
                        )
                        .await
                        {
                            log::error!("❌ Push failed: {e}");
                        } else {
                            log::debug!("✅ Push succeeded: {:?}", event.path);
                        }
                    }

                    // Periodic check for container changes → pull to local
                    _ = sync_interval.tick() => {
                        debug!("Checking for container changes to sync back...");

                        // Import SessionManager to call sync_back_to_project
                        // Note: We'll need to pass session_manager instance
                        // For now, we'll call the underlying logic directly
                        if let Err(e) = sync_container_changes_back(
                            &docker,
                            &db,
                            &session_id_clone,
                            &window_clone,
                            &project_path_clone,
                            &recently_synced_files,
                        )
                        .await
                        {
                            // Don't spam logs for "no changes" scenarios
                            if !e.to_string().contains("no changes") {
                                debug!("Container → local sync check: {e}");
                            }
                        }
                    }

                    // Periodic cleanup of old entries from recently_synced_files
                    _ = cleanup_interval.tick() => {
                        let mut synced_map = recently_synced_files.write().await;
                        let before_count = synced_map.len();

                        // Remove entries older than 2 seconds (2x skip window for safety margin)
                        synced_map.retain(|_, timestamp| timestamp.elapsed().as_secs() < 2);

                        let removed = before_count - synced_map.len();
                        if removed > 0 {
                            debug!("🧹 Cleaned up {removed} entries older than 2 seconds from recently_synced_files");
                        }
                    }

                    // Exit if channel is closed
                    else => {
                        debug!("Sync task ended for session: {session_id_clone}");
                        break;
                    }
                }
            }
        });

        // Store the task handle
        {
            let mut task_guard = self.sync_task.write().await;
            *task_guard = Some(task_handle);
        }

        // Emit success event
        window
            .emit(
                "sync-enabled",
                serde_json::json!({
                    "session_id": session_id,
                    "session_name": session.name,
                }),
            )
            .ok();

        info!("Enabled sync for session: {session_id}");
        Ok(())
    }

    /// Disable all syncing
    pub async fn disable_all_sync(&self, project_id: &str, window: &Window) -> Result<()> {
        info!("Disabling all sync for project: {project_id}");

        // Get current active session
        let project = self.db.get_project(project_id).await?;

        if let Some(session_id) = project.active_sync_session_id {
            let now = chrono::Utc::now().to_rfc3339();

            // Use a proper database transaction for atomicity
            let mut tx = self.db.pool().begin().await?;

            // Clear active session from project
            sqlx::query(
                "UPDATE projects SET active_sync_session_id = NULL, active_sync_started_at = NULL
                 WHERE id = ?",
            )
            .bind(project_id)
            .execute(&mut *tx)
            .await?;

            // Mark session as inactive
            sqlx::query(
                "UPDATE sessions SET is_sync_active = 0, sync_deactivated_at = ?
                 WHERE id = ?",
            )
            .bind(&now)
            .bind(&session_id)
            .execute(&mut *tx)
            .await?;

            // Commit the transaction
            tx.commit().await?;

            // Stop watcher
            self.watcher.stop_sync().await?;

            // Cancel the sync task
            {
                let mut task_guard = self.sync_task.write().await;
                if let Some(task) = task_guard.take() {
                    task.abort();
                    debug!("Cancelled sync task for session: {session_id}");
                }
            }

            // Emit event
            window
                .emit(
                    "sync-disabled",
                    serde_json::json!({
                        "session_id": session_id,
                    }),
                )
                .ok();

            info!("Disabled all sync for project: {project_id}");
        }

        Ok(())
    }

    /// Get current sync status
    pub async fn get_sync_status(&self, project_id: &str) -> Result<SyncStatusResponse> {
        let project = self.db.get_project(project_id).await?;

        let is_active = project.active_sync_session_id.is_some();

        Ok(SyncStatusResponse {
            active_session_id: project.active_sync_session_id,
            started_at: project.active_sync_started_at,
            is_active,
        })
    }

    /// Check if a specific session is actively syncing
    pub async fn is_session_active(&self, session_id: &str) -> bool {
        self.watcher.is_session_active(session_id).await
    }

    /// Commit session changes to local repository
    ///
    /// This requests Claude Code to create a commit in the container,
    /// then copies that commit to the local repository.
    pub async fn commit_session_changes_to_local(
        &self,
        session_id: &str,
        commit_message: &str,
        window: &Window,
    ) -> Result<CommitResult> {
        info!("Starting commit to local for session: {session_id}");

        // 1. Get session and project info
        let session = self.db.get_session(session_id).await?;
        let project = self.db.get_project(&session.project_id).await?;
        let project_path = PathBuf::from(&project.local_repo_path);

        // 2. Get container ID
        let container_id = session
            .container_id
            .as_ref()
            .ok_or_else(|| anyhow::anyhow!("Session has no container"))?;

        // 3. Check if sync is active
        let sync_was_active = session.is_sync_active;

        // 4. Disable sync if active
        if sync_was_active {
            info!("Disabling sync before commit");
            self.disable_all_sync(&project.id, window).await?;

            // Wait for sync task to fully stop
            tokio::time::sleep(tokio::time::Duration::from_millis(500)).await;
        }

        // 5. Sync container changes to local one final time
        info!("Syncing container changes to local before commit");
        let session_manager = crate::services::SessionManager::new(
            self.db.clone(),
            self.docker.clone(),
            DEFAULT_SESSION_CPU_LIMIT,
            DEFAULT_SESSION_MEMORY_LIMIT,
        );

        let sync_result = session_manager
            .sync_back_to_project(session_id, window)
            .await?;

        if !sync_result.files_failed.is_empty() {
            // Re-enable sync before returning error
            if sync_was_active {
                let _ = self.enable_sync(session_id, window).await;
            }
            return Err(anyhow::anyhow!(
                "Failed to sync {} files before commit",
                sync_result.files_failed.len()
            ));
        }

        // 5b. Capture current container HEAD before requesting commit
        let container_commit_before_claude = self
            .docker
            .exec_command_blocking(
                container_id,
                vec![
                    "git".to_string(),
                    "rev-parse".to_string(),
                    "HEAD".to_string(),
                ],
                Some("/workspace/repo".to_string()),
                None,
                false,
            )
            .await?
            .trim()
            .to_string();

        info!("Container HEAD before commit request: {container_commit_before_claude}");

        // 6. Request Claude Code to create commit in container
        info!("Requesting Claude Code to create commit");
        if let Err(e) = self.request_claude_commit(session_id, commit_message).await {
            // Re-enable sync before returning error
            if sync_was_active {
                let _ = self.enable_sync(session_id, window).await;
            }
            return Err(anyhow::anyhow!("Claude Code failed to create commit: {e}"));
        }

        // 7. Verify commit was created (get container commit hash after Claude)
        let container_commit_after = self
            .docker
            .exec_command_blocking(
                container_id,
                vec![
                    "git".to_string(),
                    "rev-parse".to_string(),
                    "HEAD".to_string(),
                ],
                Some("/workspace/repo".to_string()),
                None,
                false,
            )
            .await?
            .trim()
            .to_string();

        info!("Container commit after Claude: {container_commit_after}");

        // Verify a new commit was actually created
        if container_commit_after == container_commit_before_claude {
            // No new commit was created!
            if sync_was_active {
                let _ = self.enable_sync(session_id, window).await;
            }
            return Err(anyhow::anyhow!(
                "Claude Code reported success but no new commit was detected in container. \
                This may indicate no changes to commit or a pre-commit hook failure."
            ));
        }

        // 8. Copy commit from container to local
        info!("Copying commit from container to local");
        let local_commit_hash = match self
            .copy_commit_from_container_to_local(session_id, container_id, &project_path)
            .await
        {
            Ok(hash) => hash,
            Err(e) => {
                // Re-enable sync before returning error
                if sync_was_active {
                    let _ = self.enable_sync(session_id, window).await;
                }
                return Err(anyhow::anyhow!("Failed to copy commit to local: {e}"));
            }
        };

        // 9. Get file count from local commit
        let files_output = self
            .docker
            .exec_git_on_local(
                &project_path,
                vec!["show", "--name-only", "--format=", "HEAD"],
            )
            .await?;

        let files_changed = files_output.lines().filter(|l| !l.is_empty()).count();

        // 10. Verify container and local are in sync (optional but good for debugging)
        let local_commit_verify = self
            .docker
            .exec_git_on_local(&project_path, vec!["rev-parse", "HEAD"])
            .await?
            .trim()
            .to_string();

        info!(
            "Commit copy complete - Container: {container_commit_after}, Local: {local_commit_verify}"
        );

        // 11. Re-enable sync if it was active
        if sync_was_active {
            info!("Re-enabling sync after commit");
            tokio::time::sleep(tokio::time::Duration::from_millis(500)).await;

            self.enable_sync(session_id, window)
                .await
                .map_err(|e| anyhow::anyhow!("Failed to re-enable sync after commit: {e}"))?;
        }

        info!("Commit completed successfully: {local_commit_hash}");

        Ok(CommitResult {
            commit_hash: local_commit_hash,
            files_changed,
            success: true,
        })
    }

    /// Request Claude Code to create a commit in the container
    ///
    /// This sends a message to Claude Code asking it to create a git commit
    /// with the specified message. Pre-commit hooks will run during this process.
    ///
    /// # Arguments
    /// * `session_id` - The session ID
    /// * `commit_message` - The commit message to use
    ///
    /// # Returns
    /// Returns Ok(()) when Claude successfully completes the commit
    async fn request_claude_commit(&self, session_id: &str, commit_message: &str) -> Result<()> {
        log::info!("Requesting Claude Code to create commit in container for session {session_id}");

        // Validate commit message
        if commit_message.is_empty() {
            return Err(anyhow!("Commit message cannot be empty"));
        }
        if commit_message.len() > 10000 {
            return Err(anyhow!("Commit message too long (max 10000 characters)"));
        }

        // Construct message for Claude
        let claude_message =
            format!("Create a git commit with the following message:\n\n{commit_message}");

        // Send message to Claude Code
        let mut rx = self
            .claude
            .send_message(session_id, claude_message, None)
            .await
            .map_err(|e| anyhow!("Failed to send commit request to Claude: {e}"))?;

        // Wait for Claude to complete (with timeout)
        let timeout_duration = tokio::time::Duration::from_secs(CLAUDE_COMMIT_TIMEOUT_SECS);
        let completion = tokio::time::timeout(timeout_duration, async {
            while let Some(event) = rx.recv().await {
                match event {
                    crate::services::claude_service::StreamEvent::Complete => {
                        log::info!("Claude Code completed commit creation");
                        return Ok(());
                    }
                    crate::services::claude_service::StreamEvent::Error { message } => {
                        return Err(anyhow!("Claude Code error during commit: {message}"));
                    }
                    crate::services::claude_service::StreamEvent::ToolUse { tool_name } => {
                        log::debug!("Claude Code using tool: {tool_name}");
                    }
                    crate::services::claude_service::StreamEvent::ToolResult {
                        tool_name,
                        success,
                    } => {
                        log::debug!("Claude Code tool result: {tool_name} (success: {success})");
                    }
                    crate::services::claude_service::StreamEvent::TextDelta { .. } => {
                        // Ignore text deltas during commit
                    }
                }
            }
            Err(anyhow!(
                "Claude Code stream ended without completion signal"
            ))
        })
        .await;

        match completion {
            Ok(Ok(())) => Ok(()),
            Ok(Err(e)) => Err(e),
            Err(_) => Err(anyhow!("Timeout waiting for Claude Code to create commit")),
        }
    }

    /// Copy a commit from container to local repository using git format-patch + git am
    ///
    /// This preserves all commit metadata including author, date, and message.
    /// Pre-commit hook changes are included in the patch.
    ///
    /// # Arguments
    /// * `session_id` - The session ID
    /// * `container_id` - The container ID
    /// * `project_path` - Path to local project repository
    ///
    /// # Returns
    /// Returns the commit hash of the applied commit on local
    async fn copy_commit_from_container_to_local(
        &self,
        session_id: &str,
        container_id: &str,
        project_path: &std::path::Path,
    ) -> Result<String> {
        log::info!("Copying commit from container to local for session {session_id}");

        // Security: Validate session ID doesn't contain unsafe characters
        if session_id.contains(|c: char| c == '/' || c == '\\' || c.is_control()) {
            return Err(anyhow!("Invalid session ID contains unsafe characters"));
        }

        // Step 1: Verify a commit exists in container (get latest commit hash)
        let container_commit = self
            .docker
            .exec_command_blocking(
                container_id,
                vec![
                    "git".to_string(),
                    "rev-parse".to_string(),
                    "HEAD".to_string(),
                ],
                Some("/workspace/repo".to_string()),
                None,
                false,
            )
            .await
            .map_err(|e| anyhow!("Failed to get container commit: {e}"))?
            .trim()
            .to_string();

        log::info!("Container HEAD is at commit: {container_commit}");

        // Step 2: Check if local HEAD already points to this commit
        let local_head = self
            .docker
            .exec_git_on_local(project_path, vec!["rev-parse", "HEAD"])
            .await
            .ok()
            .map(|s| s.trim().to_string());

        if let Some(local_head) = local_head {
            if local_head == container_commit {
                log::info!(
                    "Local HEAD already points to container commit {container_commit}, skipping"
                );
                return Ok(container_commit);
            } else {
                log::info!(
                    "Local HEAD ({}) differs from container commit ({}), will apply patch",
                    &local_head[..7],
                    &container_commit[..7]
                );
            }
        }

        // Step 3: Export commit as a patch from container
        log::info!("Exporting commit as patch from container");
        let patch_content = self
            .docker
            .exec_command_blocking(
                container_id,
                vec![
                    "git".to_string(),
                    "format-patch".to_string(),
                    "-1".to_string(), // Last 1 commit
                    "HEAD".to_string(),
                    "--stdout".to_string(), // Output to stdout
                ],
                Some("/workspace/repo".to_string()),
                None,
                false,
            )
            .await
            .map_err(|e| anyhow!("Failed to export patch from container: {e}"))?;

        if patch_content.trim().is_empty() {
            return Err(anyhow!("Exported patch is empty - no commit to copy"));
        }

        // Validate patch size
        if patch_content.len() > MAX_PATCH_SIZE {
            return Err(anyhow!(
                "Patch size ({} bytes) exceeds maximum allowed size of {} bytes",
                patch_content.len(),
                MAX_PATCH_SIZE
            ));
        }

        log::info!("Exported patch size: {} bytes", patch_content.len());

        // Step 4: Write patch to temporary file on host using atomic temp file
        let mut patch_file = NamedTempFile::new_in(std::env::temp_dir())
            .map_err(|e| anyhow!("Failed to create temporary patch file: {e}"))?;

        patch_file
            .write_all(patch_content.as_bytes())
            .map_err(|e| anyhow!("Failed to write patch content: {e}"))?;

        patch_file
            .flush()
            .map_err(|e| anyhow!("Failed to flush patch file: {e}"))?;

        let patch_path = patch_file.path();
        log::info!("Writing patch to temporary file: {}", patch_path.display());

        // Step 5: Reset local working tree to clean state
        // This is necessary because sync may have copied container changes to local as uncommitted files
        // Those changes are already in the container's commit, so we need to discard them before applying the patch
        log::info!("Resetting local working tree to clean state before applying patch");

        self.docker
            .exec_git_on_local(project_path, vec!["reset", "--hard", "HEAD"])
            .await
            .map_err(|e| anyhow!("Failed to reset local working tree: {e}"))?;

        self.docker
            .exec_git_on_local(project_path, vec!["clean", "-fd"])
            .await
            .map_err(|e| anyhow!("Failed to clean untracked files: {e}"))?;

        log::info!("Local working tree cleaned successfully");

        // Step 6: Apply patch to local repository
        log::info!("Applying patch to local repository");

        // Convert path to string safely
        let patch_path_str = patch_path
            .to_str()
            .ok_or_else(|| anyhow!("Patch file path contains invalid UTF-8"))?;

        let apply_result = self
            .docker
            .exec_git_on_local(
                project_path,
                vec![
                    "am",        // Apply mailbox (patch)
                    "--3way",    // Use 3-way merge on conflicts
                    "--keep-cr", // Preserve CRLF line endings
                    patch_path_str,
                ],
            )
            .await;

        // Check if apply succeeded (temp file will be auto-deleted when patch_file goes out of scope)
        if let Err(e) = apply_result {
            // Try to provide more context about the failure
            let error_msg = e.to_string();

            if error_msg.contains("conflict") || error_msg.contains("does not apply") {
                return Err(anyhow!(
                    "Patch conflicts detected despite clean working tree. \
                    This may indicate a more complex merge conflict. \
                    Original error: {e}"
                ));
            } else {
                return Err(anyhow!("Failed to apply patch to local repository: {e}"));
            }
        }

        // Step 7: Get the new commit hash from local
        let local_commit = self
            .docker
            .exec_git_on_local(project_path, vec!["rev-parse", "HEAD"])
            .await?
            .trim()
            .to_string();

        log::info!("Successfully copied commit to local: {local_commit}");

        Ok(local_commit)
    }
}

/// Push a single file from local to session container
async fn push_file_to_container(
    docker: &DockerService,
    db: &Database,
    session_id: &str,
    file_path: &Path,
    project_path: &Path,
) -> Result<()> {
    // Get session
    let session = db.get_session(session_id).await?;

    let container_id = session
        .container_id
        .ok_or_else(|| anyhow::anyhow!("Session has no container"))?;

    // Canonicalize paths to prevent traversal attacks
    let canonical_file = file_path
        .canonicalize()
        .map_err(|e| anyhow::anyhow!("Failed to canonicalize file path: {e}"))?;
    let canonical_project = project_path
        .canonicalize()
        .map_err(|e| anyhow::anyhow!("Failed to canonicalize project path: {e}"))?;

    // Verify the file is within the project directory
    if !canonical_file.starts_with(&canonical_project) {
        return Err(anyhow::anyhow!(
            "Security error: File path is outside project directory"
        ));
    }

    log::debug!("✅ Path validated: {canonical_file:?}");

    // Get relative path (now safe after validation)
    let rel_path = canonical_file
        .strip_prefix(&canonical_project)
        .map_err(|e| anyhow::anyhow!("File not in project: {e}"))?;

    // Check if file exists (might be deleted)
    if !file_path.exists() {
        log::debug!("🗑️  File deleted, removing from container");

        // Handle file deletion
        let container_path = format!("/workspace/repo/{}", rel_path.display());

        // Use direct rm command without shell to avoid injection
        let rm_cmd = vec!["rm".to_string(), "-f".to_string(), container_path.clone()];

        docker
            .exec_command_blocking(&container_id, rm_cmd, None, None, false)
            .await?;

        debug!("Removed file from container: {container_path}");
        return Ok(());
    }

    // Check file size before reading to prevent memory exhaustion
    let metadata = tokio::fs::metadata(file_path)
        .await
        .map_err(|e| anyhow::anyhow!("Failed to read file metadata: {e}"))?;

    log::debug!("📏 Size: {} bytes", metadata.len());

    if metadata.len() > MAX_SYNC_FILE_SIZE {
        warn!(
            "File too large to sync: {} ({} bytes, max: {} bytes)",
            file_path.display(),
            metadata.len(),
            MAX_SYNC_FILE_SIZE
        );
        return Err(anyhow::anyhow!(
            "File too large to sync: {} bytes (max: {} bytes)",
            metadata.len(),
            MAX_SYNC_FILE_SIZE
        ));
    }

    // Read file content (safe after size check)
    let content = tokio::fs::read(file_path)
        .await
        .map_err(|e| anyhow::anyhow!("Failed to read file: {e}"))?;

    log::debug!("📖 Read {} bytes", content.len());

    // Push to container using base64
    use base64::Engine;
    let encoded = base64::engine::general_purpose::STANDARD.encode(&content);

    log::debug!("🔐 Encoded to {} chars", encoded.len());

    let container_path = format!("/workspace/repo/{}", rel_path.display());

    // Create parent directories if needed
    let parent_dir = Path::new(&container_path)
        .parent()
        .map(|p| p.display().to_string())
        .unwrap_or_else(|| "/workspace/repo".to_string());

    log::debug!("📁 Creating dir: {parent_dir}");

    // Use mkdir directly without shell
    let mkdir_cmd = vec!["mkdir".to_string(), "-p".to_string(), parent_dir];

    docker
        .exec_command_blocking(&container_id, mkdir_cmd, None, None, false)
        .await?;

    log::debug!("📝 Writing to container: {container_path}");

    // Write file directly using tee (avoids shell interpretation of file content)
    let write_cmd = vec![
        "sh".to_string(),
        "-c".to_string(),
        format!(
            "base64 -d | tee {} > /dev/null",
            // Escape the container path for shell safety
            shell_escape::escape(container_path.clone().into())
        ),
    ];

    // Pass the base64 content via stdin to avoid command line length limits and injection
    docker
        .exec_command_blocking(&container_id, write_cmd, None, Some(encoded), false)
        .await?;

    log::debug!("✅ Written successfully");

    debug!(
        "Pushed file to container: {} -> {}",
        rel_path.display(),
        container_path
    );
    Ok(())
}

/// Check for container changes and sync them back to local (container → local)
async fn sync_container_changes_back(
    docker: &Arc<DockerService>,
    db: &Arc<Database>,
    session_id: &str,
    window: &Window,
    project_path: &Path,
    recently_synced_files: &Arc<RwLock<HashMap<PathBuf, Instant>>>,
) -> Result<()> {
    use crate::services::SessionManager;

    // Get session to check for changes before syncing
    let session = db.get_session(session_id).await?;
    let container_id = session
        .container_id
        .as_ref()
        .ok_or_else(|| anyhow::anyhow!("Session has no container"))?;

    // Get list of changed files before syncing
    let cmd = vec![
        "git".to_string(),
        "status".to_string(),
        "--porcelain".to_string(),
    ];

    let output = docker
        .exec_command_blocking(
            container_id,
            cmd,
            Some("/workspace/repo".to_string()),
            None,
            false,
        )
        .await?;

    let mut changed_files = Vec::new();
    for line in output.lines() {
        if line.len() >= 4 {
            let file_path = &line[3..];
            changed_files.push(file_path.to_string());
        }
    }

    // Create a temporary SessionManager instance to call sync_back_to_project
    // Using default resource limits (same as AppState)
    let session_manager = SessionManager::new(
        Arc::clone(db),
        Arc::clone(docker),
        1.0,  // default_cpu_limit
        2048, // default_memory_limit_mb
    );

    // Call the existing sync_back_to_project function
    let result = session_manager
        .sync_back_to_project(session_id, window)
        .await?;

    // Record all synced files to prevent sync loop
    if result.files_synced > 0 {
        info!(
            "Synced {} files from container to local ({} bytes in {}ms)",
            result.files_synced, result.bytes_synced, result.duration_ms
        );

        // Record all changed files as recently synced
        let now = Instant::now();
        let mut synced_map = recently_synced_files.write().await;
        for file_path in changed_files {
            let full_path = project_path.join(&file_path);

            // Try to canonicalize the path to match file watcher paths
            // If canonicalization fails (e.g., file was deleted), use the joined path
            let normalized_path = full_path.canonicalize().unwrap_or(full_path);

            synced_map.insert(normalized_path, now);
        }
        debug!(
            "Recorded {} files as recently synced to prevent loop",
            synced_map.len()
        );
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_sync_status_response() {
        let status = SyncStatusResponse {
            active_session_id: Some("session-123".to_string()),
            started_at: Some("2025-10-23T10:00:00Z".to_string()),
            is_active: true,
        };

        assert_eq!(status.active_session_id, Some("session-123".to_string()));
        assert!(status.is_active);
    }
}
