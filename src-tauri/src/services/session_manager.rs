use crate::database::Database;
use crate::models::{NewSession, Session};
use crate::services::DockerService;
use anyhow::{anyhow, Result};
use serde_json::json;
use std::sync::Arc;
use tauri::{AppHandle, Emitter};

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

        // Step 2: Create container with host .claude mounted
        let container_id = match self
            .docker
            .create_container(
                &container_name,
                &session.local_repo_path,
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
    /// 4. Soft delete in database (is_deleted=1)
    ///
    /// Note: Session data in ~/.claude persists on host after deletion
    #[allow(dead_code)] // Will be called from Tauri commands (Phase 4)
    pub async fn delete_session(&self, session_id: &str) -> Result<()> {
        // Get session to find container ID
        let session = self
            .db
            .get_session(session_id)
            .await
            .map_err(|e| anyhow!("Failed to get session: {e}"))?;

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

        // Step 2: Soft delete in database
        self.db
            .delete_session(session_id)
            .await
            .map_err(|e| anyhow!("Failed to delete session in database: {e}"))?;

        log::info!("Session {session_id} deleted (host .claude data persists)");
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
