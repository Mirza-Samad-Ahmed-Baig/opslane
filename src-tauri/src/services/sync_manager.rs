use crate::database::Database;
use crate::services::{DockerService, SyncWatcher};
use anyhow::Result;
use log::{debug, info, warn};
use serde::Serialize;
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::Instant;
use tauri::{Emitter, Window};
use tokio::sync::RwLock;
use tokio::task::JoinHandle;

/// Maximum file size for sync (100MB)
const MAX_SYNC_FILE_SIZE: u64 = 100 * 1024 * 1024;

/// Manages two-way sync between local files and session containers
pub struct SyncManager {
    db: Arc<Database>,
    docker: Arc<DockerService>,
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

impl SyncManager {
    pub fn new(db: Arc<Database>, docker: Arc<DockerService>) -> Self {
        Self {
            db,
            docker,
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
            .exec_command_blocking(&container_id, rm_cmd, None, false)
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
        .exec_command_blocking(&container_id, mkdir_cmd, None, false)
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
        .exec_command_blocking(&container_id, write_cmd, Some(encoded), false)
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
    project_path: &PathBuf,
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
        .exec_command_blocking(container_id, cmd, Some("/workspace/repo".to_string()), false)
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
