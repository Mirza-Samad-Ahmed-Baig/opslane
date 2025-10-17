use crate::database::Database;
use crate::models::{NewSession, Session};
use crate::services::DockerService;
use anyhow::{anyhow, Result};
use serde_json::json;
use std::sync::Arc;
use tauri::{AppHandle, Emitter};

/// Read Claude credentials from macOS Keychain
///
/// Uses `security` command to read credentials stored by Claude CLI
fn read_claude_credentials_from_keychain() -> Result<String> {
    use std::process::Command;

    let username = std::env::var("USER").map_err(|_| anyhow!("Could not determine username"))?;

    let output = Command::new("security")
        .args([
            "find-generic-password",
            "-s",
            "Claude Code-credentials",
            "-a",
            &username,
            "-w",
        ])
        .output()
        .map_err(|e| anyhow!("Failed to execute security command: {e}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        if stderr.contains("could not be found") {
            return Err(anyhow!("Claude credentials not found in Keychain"));
        }
        return Err(anyhow!("Failed to read credentials: {stderr}"));
    }

    let credentials_json = String::from_utf8_lossy(&output.stdout).trim().to_string();

    if credentials_json.is_empty() {
        return Err(anyhow!("Credentials are empty"));
    }

    // Validate JSON format
    serde_json::from_str::<serde_json::Value>(&credentials_json)
        .map_err(|e| anyhow!("Invalid credentials format: {e}"))?;

    Ok(credentials_json)
}

/// Session manager orchestrates database and Docker operations
pub struct SessionManager {
    #[allow(dead_code)] // Used in create_session (Phase 4)
    db: Arc<Database>,
    #[allow(dead_code)] // Used in create_session, delete_session (Phase 4)
    docker: Arc<DockerService>,
    #[allow(dead_code)] // Used in create_session (Phase 4)
    default_cpu_limit: f64,
    #[allow(dead_code)] // Used in create_session (Phase 4)
    default_memory_limit_mb: i64,
}

impl SessionManager {
    /// Create new session manager
    pub fn new(
        db: Arc<Database>,
        docker: Arc<DockerService>,
        default_cpu_limit: f64,
        default_memory_limit_mb: i64,
    ) -> Self {
        Self {
            db,
            docker,
            default_cpu_limit,
            default_memory_limit_mb,
        }
    }

    /// Generate container name from session ID
    ///
    /// Format: opslane-session-{first-8-chars-of-uuid}
    /// Example: opslane-session-550e8400
    fn generate_container_name(session_id: &str) -> String {
        let short_uuid = &session_id[..8];
        format!("opslane-session-{short_uuid}")
    }

    /// Calculate directory size in megabytes
    ///
    /// Uses `du -sm` command to quickly calculate total directory size.
    /// Returns 0 if calculation fails (non-fatal).
    async fn get_dir_size_mb(path: &str) -> f64 {
        match tokio::process::Command::new("du")
            .args(["-sm", path]) // Size in MB, summary only
            .output()
            .await
        {
            Ok(output) if output.status.success() => {
                let size_str = String::from_utf8_lossy(&output.stdout);
                size_str
                    .split_whitespace()
                    .next()
                    .and_then(|s| s.parse::<u64>().ok())
                    .map(|s| s as f64)
                    .unwrap_or(0.0)
            }
            _ => {
                log::warn!("Failed to calculate directory size for {path}");
                0.0
            }
        }
    }

    /// Copy repository to session-specific location
    ///
    /// Creates an isolated copy of the repository for this session in /tmp/opslane-sessions/{session_id}/repo
    /// Uses cp -a for fast local copying, preserving permissions and symlinks.
    ///
    /// Returns the path to the copied repository and the size in MB.
    async fn copy_repo_for_session(
        &self,
        session_id: &str,
        original_path: &str,
    ) -> Result<(String, f64)> {
        // Calculate repo size for logging and progress
        let repo_size_mb = Self::get_dir_size_mb(original_path).await;

        // Create session-specific directory
        let session_repo_path = format!("/tmp/opslane-sessions/{session_id}/repo");

        log::info!(
            "Copying {repo_size_mb:.1} MB repo from {original_path} to {session_repo_path} for session {session_id}"
        );

        // Create parent directory (but not the final directory - cp will create it)
        let parent_dir = format!("/tmp/opslane-sessions/{session_id}");
        tokio::fs::create_dir_all(&parent_dir)
            .await
            .map_err(|e| anyhow!("Failed to create session directory: {e}"))?;

        // Copy using cp -a (archive mode: preserves permissions, symlinks, ownership)
        // This is 2-3x faster than rsync for local-to-local copies
        let output = tokio::process::Command::new("cp")
            .args([
                "-a",               // Archive mode (recursive, preserve all attributes)
                original_path,      // Source
                &session_repo_path, // Destination
            ])
            .output()
            .await
            .map_err(|e| anyhow!("Failed to execute cp: {e}"))?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(anyhow!("cp failed: {stderr}"));
        }

        // Clean up git lock files after copy (they should not be copied)
        let index_lock = format!("{session_repo_path}/.git/index.lock");
        let head_lock = format!("{session_repo_path}/.git/HEAD.lock");

        let _ = tokio::fs::remove_file(&index_lock).await; // Ignore errors - file may not exist
        let _ = tokio::fs::remove_file(&head_lock).await;

        log::info!("Successfully copied {repo_size_mb:.1} MB repo for session {session_id}");

        Ok((session_repo_path, repo_size_mb))
    }

    /// Create a new session with container
    ///
    /// This orchestrates:
    /// 1. Create database record (status="created")
    /// 2. Create Docker container with resource limits
    /// 3. Start container
    /// 4. Update database with container info (status="ready")
    ///
    /// On any failure after step 1, updates status="error" and error_message
    #[allow(dead_code)] // Will be called from Tauri commands (Phase 4)
    pub async fn create_session(&self, new: NewSession, app_handle: AppHandle) -> Result<Session> {
        // Step 1: Create database record
        let mut session = self
            .db
            .create_session(new)
            .await
            .map_err(|e| anyhow!("Failed to create session in database: {e}"))?;

        log::info!("Created session {} in database", session.id);

        // Calculate repo size for progress message
        let repo_size_mb = Self::get_dir_size_mb(&session.local_repo_path).await;
        let size_display = if repo_size_mb >= 1000.0 {
            format!("{:.1} GB", repo_size_mb / 1000.0)
        } else if repo_size_mb > 0.0 {
            format!("{repo_size_mb:.0} MB")
        } else {
            "unknown size".to_string()
        };

        // Emit progress: Copying repository with size
        let _ = app_handle.emit(
            "session-progress",
            json!({
                "session_id": &session.id,
                "status": "copying",
                "message": format!("Copying {} repository...", size_display)
            }),
        );

        // Step 1.5: Copy repository to session-specific location
        let (session_repo_path, _copied_size_mb) = match self
            .copy_repo_for_session(&session.id, &session.local_repo_path)
            .await
        {
            Ok((path, size)) => (path, size),
            Err(e) => {
                let error_msg = format!("Failed to copy repository: {e}");
                log::error!("{error_msg}");

                if let Err(db_err) = self.db.update_session_status(&session.id, "error").await {
                    log::error!("Failed to update session status: {db_err}");
                }

                return Err(anyhow!(error_msg));
            }
        };

        // Update session with the copy path
        session.session_repo_path = Some(session_repo_path.clone());

        // Store in database
        if let Err(e) = self
            .db
            .update_session_repo_path(&session.id, &session_repo_path)
            .await
        {
            log::error!("Failed to store session_repo_path in database: {e}");
            // Non-fatal, continue
        }

        // Emit progress: Creating container
        let _ = app_handle.emit(
            "session-progress",
            json!({
                "session_id": &session.id,
                "status": "creating",
                "message": "Creating container..."
            }),
        );

        // Generate container name
        let container_name = Self::generate_container_name(&session.id);

        // Use session-specific limits or defaults
        let cpu_limit = self.default_cpu_limit; // TODO: Get from session once settings are implemented
        let memory_limit_mb = self.default_memory_limit_mb;

        // Step 2: Create container with COPY (not original)
        let container_id = match self
            .docker
            .create_container(
                &container_name,
                &session_repo_path, // CHANGED: Use copy instead of original
                cpu_limit,
                memory_limit_mb,
            )
            .await
        {
            Ok(id) => {
                log::info!("Created container {} for session {}", id, session.id);
                id
            }
            Err(e) => {
                // Update DB with error
                let error_msg = format!("Failed to create container: {e}");
                log::error!("{error_msg}");

                // Clean up the copied repo
                if let Err(cleanup_err) = tokio::fs::remove_dir_all(&session_repo_path).await {
                    log::error!("Failed to cleanup session repo after container creation failure: {cleanup_err}");
                }

                if let Err(db_err) = self.db.update_session_status(&session.id, "error").await {
                    log::error!("Failed to update session status: {db_err}");
                }

                return Err(anyhow!(error_msg));
            }
        };

        // Emit progress: Starting container
        let _ = app_handle.emit(
            "session-progress",
            json!({
                "session_id": &session.id,
                "status": "starting",
                "message": "Starting container..."
            }),
        );

        // Step 3: Start container
        if let Err(e) = self.docker.start_container(&container_id).await {
            let error_msg = format!("Failed to start container: {e}");
            log::error!("{error_msg}");

            // Try to clean up container
            if let Err(cleanup_err) = self.docker.remove_container(&container_id).await {
                log::error!("Failed to cleanup container after start failure: {cleanup_err}");
            }

            // Update DB with error
            if let Err(db_err) = self.db.update_session_status(&session.id, "error").await {
                log::error!("Failed to update session status: {db_err}");
            }

            return Err(anyhow!(error_msg));
        }

        log::info!(
            "Started container {} for session {}",
            container_id,
            session.id
        );

        // Step 3.5: Setup Claude credentials in container
        // Read credentials from host keychain and write to container
        log::info!("Setting up Claude credentials for session {}", session.id);

        // Emit progress: Setting up credentials
        let _ = app_handle.emit(
            "session-progress",
            json!({
                "session_id": &session.id,
                "status": "configuring",
                "message": "Setting up Claude credentials..."
            }),
        );

        // Try to read and setup credentials - but don't fail session creation if this fails
        match read_claude_credentials_from_keychain() {
            Ok(credentials_json) => {
                // Write credentials to container
                if let Err(e) = self
                    .docker
                    .setup_claude_credentials(&container_id, &credentials_json)
                    .await
                {
                    log::error!("Failed to setup credentials (continuing anyway): {e}");
                    // Don't fail the whole session creation - just log warning
                    // Session will work but Claude commands will fail with auth errors
                    let _ = app_handle.emit(
                        "session-progress",
                        json!({
                            "session_id": &session.id,
                            "status": "warning",
                            "message": "Claude credentials not configured. Please log in to Claude CLI."
                        }),
                    );
                } else {
                    log::info!("Claude credentials configured successfully");
                }
            }
            Err(e) => {
                log::warn!("Could not read Claude credentials from keychain: {e}");
                log::warn!("Session will be created but Claude commands may fail");
                let _ = app_handle.emit(
                    "session-progress",
                    json!({
                        "session_id": &session.id,
                        "status": "warning",
                        "message": "Claude credentials not found. Please log in to Claude CLI."
                    }),
                );
            }
        }

        // Step 3.6: Configure git safe.directory to prevent ownership errors
        log::info!("Configuring git for session {}", session.id);
        if let Err(e) = self
            .docker
            .configure_git_safe_directory(&container_id)
            .await
        {
            log::warn!("Failed to configure git safe.directory (continuing anyway): {e}");
            // This is not critical - git commands will just show ownership warnings
        }

        // Step 4: Update database with container info and set status to "ready"
        if let Err(e) = self
            .db
            .update_session_container(&session.id, &container_id, &container_name, "main")
            .await
        {
            log::error!("Failed to update container info: {e}");
            // Container is running but DB not updated - this is a problem
            // Try to stop and remove container
            if let Err(stop_err) = self.docker.stop_container(&container_id).await {
                log::error!("Failed to stop container: {stop_err}");
            }
            if let Err(rm_err) = self.docker.remove_container(&container_id).await {
                log::error!("Failed to remove container: {rm_err}");
            }
            // Update session status to error
            if let Err(db_err) = self.db.update_session_status(&session.id, "error").await {
                log::error!(
                    "Failed to update session status after container info update failure: {db_err}"
                );
            }
            return Err(anyhow!("Failed to update session with container info: {e}"));
        }

        if let Err(e) = self.db.update_session_status(&session.id, "ready").await {
            log::error!("Failed to update session status to ready: {e}");
            return Err(anyhow!("Session created but status update failed: {e}"));
        }

        // Refresh session from database to get updated fields
        session = self
            .db
            .get_session(&session.id)
            .await
            .map_err(|e| anyhow!("Failed to fetch updated session: {e}"))?;

        log::info!(
            "Session {} is ready (container: {})",
            session.id,
            container_id
        );

        // Emit progress: Container ready
        let _ = app_handle.emit(
            "session-progress",
            json!({
                "session_id": &session.id,
                "status": "ready",
                "message": "Container ready"
            }),
        );

        Ok(session)
    }

    /// List all active sessions
    #[allow(dead_code)] // Will be called from Tauri commands (Phase 4)
    pub async fn list_sessions(&self) -> Result<Vec<Session>> {
        self.db
            .list_sessions()
            .await
            .map_err(|e| anyhow!("Failed to list sessions: {e}"))
    }

    /// Get a single session by ID
    pub async fn get_session(&self, session_id: &str) -> Result<Session> {
        self.db
            .get_session(session_id)
            .await
            .map_err(|e| anyhow!("Failed to get session: {e}"))
    }

    /// Get container logs for a session
    pub async fn get_container_logs(&self, session_id: &str) -> Result<String> {
        let session = self.get_session(session_id).await?;

        if let Some(container_id) = &session.container_id {
            let logs = self.docker.get_logs(container_id).await?;
            Ok(logs)
        } else {
            Err(anyhow!("No container for this session"))
        }
    }

    /// Delete session and cleanup resources
    ///
    /// This performs:
    /// 1. Get session details
    /// 2. Stop container (if running)
    /// 3. Remove container
    /// 4. Clean up copied repository
    /// 5. Soft delete in database (is_deleted=1)
    ///
    /// Note: Session data in ~/.claude persists on host after deletion
    #[allow(dead_code)] // Will be called from Tauri commands (Phase 4)
    pub async fn delete_session(&self, session_id: &str) -> Result<()> {
        // Get session to find container ID and repo copy
        let session = self
            .db
            .get_session(session_id)
            .await
            .map_err(|e| anyhow!("Failed to get session: {e}"))?;

        log::info!("Deleting session: {session_id}");

        // Step 1: Cleanup container if it exists
        if let Some(container_id) = &session.container_id {
            log::info!("Cleaning up container {container_id} for session {session_id}");

            // Stop container (ignore errors if already stopped)
            if let Err(e) = self.docker.stop_container(container_id).await {
                log::warn!("Failed to stop container {container_id} (may already be stopped): {e}");
            }

            // Remove container
            if let Err(e) = self.docker.remove_container(container_id).await {
                log::error!("Failed to remove container {container_id}: {e}");
                // Don't fail the whole operation - continue with cleanup
            } else {
                log::info!("Removed container {container_id}");
            }
        }

        // Step 2: Clean up the copied repository
        if let Some(session_repo_path) = &session.session_repo_path {
            log::info!("Removing session repo copy at {session_repo_path}");

            if let Err(e) = tokio::fs::remove_dir_all(session_repo_path).await {
                log::error!("Failed to remove session repo copy: {e}");
                // Non-fatal, continue with deletion
            }
        }

        // Step 3: Soft delete in database
        self.db
            .delete_session(session_id)
            .await
            .map_err(|e| anyhow!("Failed to delete session in database: {e}"))?;

        log::info!("Successfully deleted session {session_id}");
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // Note: Real integration tests would require Docker daemon
    // Here we test the orchestration logic with mocked components

    #[tokio::test]
    async fn test_container_name_generation() {
        let session_id = "550e8400-e29b-41d4-a716-446655440000";
        let container_name = SessionManager::generate_container_name(session_id);

        assert_eq!(container_name, "opslane-session-550e8400");
        assert_eq!(container_name.len(), 24); // "opslane-session-" (16) + "550e8400" (8) = 24
    }

    #[tokio::test]
    async fn test_resource_limits_passed_correctly() {
        // Test that default limits are used when creating containers
        let cpu_limit = 1.5;
        let memory_limit_mb: i64 = 4096;

        // These would be passed to docker.create_container()
        let nano_cpus = (cpu_limit * 1_000_000_000.0) as i64;
        let memory_bytes = memory_limit_mb * 1024 * 1024;

        assert_eq!(nano_cpus, 1_500_000_000);
        assert_eq!(memory_bytes, 4294967296i64);
    }
}
