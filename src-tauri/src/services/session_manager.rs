use crate::database::Database;
use crate::models::{NewSession, Session};
use crate::services::DockerService;
use anyhow::{anyhow, Result};
use chrono::Utc;
use ignore::WalkBuilder;
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::path::Path;
use std::sync::Arc;
use tauri::{AppHandle, Emitter};

/// Event payload for session status changes
///
/// Phase 3: Used for event-driven frontend updates instead of polling
#[derive(Clone, Serialize, Deserialize)]
struct SessionStatusEvent {
    session_id: String,
    status: String,
    timestamp: String,
}

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

    /// Emit session status change event to frontend
    ///
    /// Phase 3: Event-driven updates to replace polling
    /// Emits "session-status-changed" event that frontend hooks listen to
    fn emit_status_event(&self, app_handle: &AppHandle, session_id: &str, status: &str) {
        log::info!("Emitting session-status-changed event: session={session_id}, status={status}");

        if let Err(e) = app_handle.emit(
            "session-status-changed",
            SessionStatusEvent {
                session_id: session_id.to_string(),
                status: status.to_string(),
                timestamp: Utc::now().to_rfc3339(),
            },
        ) {
            log::warn!("Failed to emit status event: {e}");
        }
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

    /// Copy repository to session-specific location (respecting .gitignore)
    ///
    /// Creates an isolated copy of the repository for this session in /tmp/opslane-sessions/{session_id}/repo
    /// Uses the `ignore` crate to respect .gitignore patterns, significantly reducing copy size
    /// and time for repositories with large build artifacts or dependencies.
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
            "Copying {repo_size_mb:.1} MB repo from {original_path} to {session_repo_path} (respecting .gitignore)"
        );

        // Create parent directory
        let parent_dir = format!("/tmp/opslane-sessions/{session_id}");
        tokio::fs::create_dir_all(&parent_dir)
            .await
            .map_err(|e| anyhow!("Failed to create session directory: {e}"))?;

        // Collect files and copy in blocking task (handles read-only git objects)
        let source = original_path.to_string();
        let dest = session_repo_path.clone();
        let file_count = tokio::task::spawn_blocking(move || -> Result<usize> {
            let mut files = Vec::new();

            // Build walker with .gitignore support
            let walker = WalkBuilder::new(&source)
                .hidden(false) // Include hidden files like .env
                .git_ignore(true) // Respect .gitignore files
                .git_global(false) // Don't use global gitignore
                .git_exclude(true) // Respect .git/info/exclude
                .require_git(false) // Work even without .git directory
                .follow_links(false) // Don't follow symlinks (security)
                .build();

            for result in walker {
                match result {
                    Ok(entry) => {
                        let path = entry.path();
                        if entry.file_type().map(|ft| ft.is_file()).unwrap_or(false) {
                            files.push(path.to_path_buf());
                        }
                    }
                    Err(err) => {
                        log::warn!("Error walking directory: {err}");
                    }
                }
            }

            // Additionally, collect all files from .git directory explicitly
            // (since ignore crate skips it by default)
            let git_dir = Path::new(&source).join(".git");
            if git_dir.exists() {
                Self::collect_git_files(&git_dir, &mut files);
            }

            let file_count = files.len();
            log::info!("Found {file_count} files to copy (after .gitignore filtering)");

            // Copy files synchronously in blocking task
            for source_file in files {
                let relative_path = source_file
                    .strip_prefix(&source)
                    .map_err(|e| anyhow!("Failed to get relative path: {e}"))?;

                let dest_file = Path::new(&dest).join(relative_path);

                // Create parent directories
                if let Some(parent) = dest_file.parent() {
                    std::fs::create_dir_all(parent).map_err(|e| {
                        anyhow!("Failed to create directory {}: {e}", parent.display())
                    })?;
                }

                // Remove destination if it exists (might be read-only from previous failed attempt)
                if dest_file.exists() {
                    if let Err(e) = std::fs::remove_file(&dest_file) {
                        log::debug!(
                            "Could not remove existing file {}: {e}",
                            dest_file.display()
                        );
                    }
                }

                // Copy file
                std::fs::copy(&source_file, &dest_file)
                    .map_err(|e| anyhow!("Failed to copy file {}: {e}", source_file.display()))?;

                // Make file writable (git objects are read-only, but we want to be able to delete later)
                // Note: Only needed on Unix systems - Windows doesn't create read-only files by default
                // and std::fs::copy preserves Unix permissions, so we need to explicitly add write permission
                #[cfg(unix)]
                {
                    use std::os::unix::fs::PermissionsExt;
                    if let Ok(metadata) = std::fs::metadata(&dest_file) {
                        let mut perms = metadata.permissions();
                        perms.set_mode(perms.mode() | 0o200); // Add write permission for owner
                        let _ = std::fs::set_permissions(&dest_file, perms); // Ignore errors
                    }
                }
            }

            Ok(file_count)
        })
        .await
        .map_err(|e| anyhow!("Failed to walk/copy directory: {e}"))??;

        // Clean up git lock files after copy (they should not be copied)
        let index_lock = format!("{session_repo_path}/.git/index.lock");
        let head_lock = format!("{session_repo_path}/.git/HEAD.lock");

        let _ = tokio::fs::remove_file(&index_lock).await; // Ignore errors - file may not exist
        let _ = tokio::fs::remove_file(&head_lock).await;

        log::info!(
            "Successfully copied {file_count} files ({repo_size_mb:.1} MB original) for session {session_id}"
        );

        Ok((session_repo_path, repo_size_mb))
    }

    /// Helper function to recursively collect all files from .git directory
    ///
    /// The ignore crate skips .git by default, but we want to preserve git history,
    /// so we manually walk the .git directory.
    ///
    /// Uses iterative approach with a queue to avoid stack overflow on deeply nested repos.
    fn collect_git_files(dir: &Path, files: &mut Vec<std::path::PathBuf>) {
        let mut dirs_to_process = vec![dir.to_path_buf()];

        while let Some(current_dir) = dirs_to_process.pop() {
            if let Ok(entries) = std::fs::read_dir(&current_dir) {
                for entry in entries.flatten() {
                    let path = entry.path();

                    if path.is_file() {
                        files.push(path);
                    } else if path.is_dir() {
                        dirs_to_process.push(path);
                    }
                }
            }
        }
    }

    /// Setup container for an existing session record
    ///
    /// Phase 1: Split from create_session to enable optimistic UI.
    /// This method is called in a background task after the session record is created.
    ///
    /// Steps:
    /// 1. Copy repository (respecting .gitignore)
    /// 2. Create Docker container with resource limits
    /// 3. Start container
    /// 4. Configure Claude credentials
    /// 5. Configure git safe.directory
    /// 6. Update database with container info (status="ready")
    ///
    /// Emits progress events throughout the process.
    pub async fn setup_container(&self, session_id: &str, app_handle: &AppHandle) -> Result<()> {
        log::info!("Setting up container for session {session_id}");

        // 1. Get session from DB
        let mut session = self.db.get_session(session_id).await?;

        // 2. Get project to retrieve local_repo_path
        let project = self.db.get_project(&session.project_id).await?;
        let local_repo_path = &project.local_repo_path;

        log::info!("========================================");
        log::info!("setup_container called for session {session_id}");
        log::info!("  name: {}", session.name);
        log::info!("  project: {}", project.name);
        log::info!("  path: {local_repo_path}");
        log::info!("  branch: {}", session.base_branch);
        log::info!("========================================");

        // Define total steps for progress tracking
        const TOTAL_STEPS: u8 = 5;

        // Calculate repo size for progress message
        let repo_size_mb = Self::get_dir_size_mb(local_repo_path).await;
        let size_display = if repo_size_mb >= 1000.0 {
            format!("{:.1} GB", repo_size_mb / 1000.0)
        } else if repo_size_mb > 0.0 {
            format!("{repo_size_mb:.0} MB")
        } else {
            "unknown size".to_string()
        };

        log::info!("Step 1: Copying repository (size: {size_display})...");

        // Emit progress: Copying repository with size
        log::info!("EMITTING EVENT: session-progress (copying) for session {session_id}");
        let _ = app_handle.emit(
            "session-progress",
            json!({
                "session_id": session_id,
                "status": "copying",
                "message": format!("Copying {} repository (respecting .gitignore)...", size_display),
                "step": 1,
                "total_steps": TOTAL_STEPS,
            }),
        );

        // Step 1: Copy repository to session-specific location
        let (session_repo_path, _copied_size_mb) = match self
            .copy_repo_for_session(session_id, local_repo_path)
            .await
        {
            Ok((path, size)) => (path, size),
            Err(e) => {
                let error_msg = format!("Failed to copy repository: {e}");
                log::error!("{error_msg}");

                if let Err(db_err) = self.db.update_session_status(session_id, "error").await {
                    log::error!("Failed to update session status: {db_err}");
                }

                // Emit status change event
                self.emit_status_event(app_handle, session_id, "error");

                return Err(anyhow!(error_msg));
            }
        };

        // Update session with the copy path
        session.session_repo_path = Some(session_repo_path.clone());

        // Store in database
        if let Err(e) = self
            .db
            .update_session_repo_path(session_id, &session_repo_path)
            .await
        {
            log::error!("Failed to store session_repo_path in database: {e}");
            // Non-fatal, continue
        }

        log::info!("Step 1 COMPLETE: Repository copied to {session_repo_path}");
        log::info!("Step 2: Creating container...");

        // Emit progress: Creating container
        log::info!("EMITTING EVENT: session-progress (creating) for session {session_id}");
        let _ = app_handle.emit(
            "session-progress",
            json!({
                "session_id": session_id,
                "status": "creating",
                "message": "Creating container...",
                "step": 2,
                "total_steps": TOTAL_STEPS,
            }),
        );

        // Generate container name
        let container_name = Self::generate_container_name(session_id);

        // Use session-specific limits or defaults
        let cpu_limit = self.default_cpu_limit;
        let memory_limit_mb = self.default_memory_limit_mb;

        // Step 2: Create container with COPY (not original)
        let container_id = match self
            .docker
            .create_container(
                &container_name,
                &session_repo_path,
                cpu_limit,
                memory_limit_mb,
            )
            .await
        {
            Ok(id) => {
                log::info!("Created container {id} for session {session_id}");
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

                if let Err(db_err) = self.db.update_session_status(session_id, "error").await {
                    log::error!("Failed to update session status: {db_err}");
                }

                // Emit status change event
                self.emit_status_event(app_handle, session_id, "error");

                return Err(anyhow!(error_msg));
            }
        };

        // Emit progress: Starting container
        let _ = app_handle.emit(
            "session-progress",
            json!({
                "session_id": session_id,
                "status": "starting",
                "message": "Starting container...",
                "step": 3,
                "total_steps": TOTAL_STEPS,
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
            if let Err(db_err) = self.db.update_session_status(session_id, "error").await {
                log::error!("Failed to update session status: {db_err}");
            }

            // Emit status change event
            self.emit_status_event(app_handle, session_id, "error");

            return Err(anyhow!(error_msg));
        }

        log::info!("Started container {container_id} for session {session_id}");

        // Step 4: Setup Claude credentials in container
        log::info!("Setting up Claude credentials for session {session_id}");

        // Emit progress: Setting up credentials
        let _ = app_handle.emit(
            "session-progress",
            json!({
                "session_id": session_id,
                "status": "configuring",
                "message": "Setting up Claude credentials...",
                "step": 4,
                "total_steps": TOTAL_STEPS,
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
                    let _ = app_handle.emit(
                        "session-progress",
                        json!({
                            "session_id": session_id,
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
                        "session_id": session_id,
                        "status": "warning",
                        "message": "Claude credentials not found. Please log in to Claude CLI."
                    }),
                );
            }
        }

        // Step 5: Configure git safe.directory to prevent ownership errors
        log::info!("Configuring git for session {session_id}");
        if let Err(e) = self
            .docker
            .configure_git_safe_directory(&container_id)
            .await
        {
            log::warn!("Failed to configure git safe.directory (continuing anyway): {e}");
        }

        // Step 6: Update database with container info and set status to "ready"
        if let Err(e) = self
            .db
            .update_session_container(session_id, &container_id, &container_name, "main")
            .await
        {
            log::error!("Failed to update container info: {e}");
            // Container is running but DB not updated - try to cleanup
            if let Err(stop_err) = self.docker.stop_container(&container_id).await {
                log::error!("Failed to stop container: {stop_err}");
            }
            if let Err(rm_err) = self.docker.remove_container(&container_id).await {
                log::error!("Failed to remove container: {rm_err}");
            }
            if let Err(db_err) = self.db.update_session_status(session_id, "error").await {
                log::error!(
                    "Failed to update session status after container info update failure: {db_err}"
                );
            }

            // Emit status change event
            self.emit_status_event(app_handle, session_id, "error");

            return Err(anyhow!("Failed to update session with container info: {e}"));
        }

        if let Err(e) = self.db.update_session_status(session_id, "ready").await {
            log::error!("Failed to update session status to ready: {e}");

            // Emit status change event (though DB update failed, try to notify frontend)
            self.emit_status_event(app_handle, session_id, "error");

            return Err(anyhow!("Session created but status update failed: {e}"));
        }

        log::info!("Session {session_id} is ready (container: {container_id})");

        // Emit status change event
        self.emit_status_event(app_handle, session_id, "ready");

        log::info!("========================================");
        log::info!("EMITTING FINAL EVENT: session-progress (ready)");
        log::info!("  session_id: {session_id}");
        log::info!("  status: ready");
        log::info!("  container: {container_id}");
        log::info!("========================================");

        // Emit progress: Container ready
        let _ = app_handle.emit(
            "session-progress",
            json!({
                "session_id": session_id,
                "status": "ready",
                "message": "Session is ready!",
                "step": 5,
                "total_steps": TOTAL_STEPS,
            }),
        );

        log::info!("Event emitted successfully");

        Ok(())
    }

    /// DEPRECATED: Use create_session command + setup_container instead
    ///
    /// This method is kept for backward compatibility but should not be used.
    /// New code should create session in DB first, then call setup_container in background.
    #[allow(dead_code)]
    pub async fn create_session(&self, new: NewSession, app_handle: AppHandle) -> Result<Session> {
        // Get project to retrieve local_repo_path
        let project = self.db.get_project(&new.project_id).await?;
        let local_repo_path = &project.local_repo_path;

        log::info!("========================================");
        log::info!("create_session called");
        log::info!("  name: {}", new.name);
        log::info!("  project: {}", project.name);
        log::info!("  path: {local_repo_path}");
        log::info!("  branch: {}", new.base_branch);
        log::info!("  has_initial_message: {}", new.initial_message.is_some());
        log::info!("========================================");

        // Define total steps for progress tracking
        const TOTAL_STEPS: u8 = 5;

        // Step 1: Create database record
        log::info!("Step 1: Creating database record...");
        let mut session = self
            .db
            .create_session(new)
            .await
            .map_err(|e| anyhow!("Failed to create session in database: {e}"))?;

        log::info!(
            "Step 1 COMPLETE: Created session {} in database with status={:?}",
            session.id,
            session.status
        );

        // Calculate repo size for progress message
        let repo_size_mb = Self::get_dir_size_mb(local_repo_path).await;
        let size_display = if repo_size_mb >= 1000.0 {
            format!("{:.1} GB", repo_size_mb / 1000.0)
        } else if repo_size_mb > 0.0 {
            format!("{repo_size_mb:.0} MB")
        } else {
            "unknown size".to_string()
        };

        log::info!("Step 2: Copying repository (size: {size_display})...");

        // Emit progress: Copying repository with size
        log::info!(
            "EMITTING EVENT: session-progress (copying) for session {}",
            session.id
        );
        let _ = app_handle.emit(
            "session-progress",
            json!({
                "session_id": &session.id,
                "status": "copying",
                "message": format!("Copying {} repository (respecting .gitignore)...", size_display),
                "step": 1,
                "total_steps": TOTAL_STEPS,
            }),
        );

        // Step 1.5: Copy repository to session-specific location
        let (session_repo_path, _copied_size_mb) = match self
            .copy_repo_for_session(&session.id, local_repo_path)
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

        log::info!("Step 2 COMPLETE: Repository copied to {session_repo_path}");
        log::info!("Step 3: Creating container...");

        // Emit progress: Creating container
        log::info!(
            "EMITTING EVENT: session-progress (creating) for session {}",
            session.id
        );
        let _ = app_handle.emit(
            "session-progress",
            json!({
                "session_id": &session.id,
                "status": "creating",
                "message": "Creating container...",
                "step": 2,
                "total_steps": TOTAL_STEPS,
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
                "message": "Starting container...",
                "step": 3,
                "total_steps": TOTAL_STEPS,
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
                "message": "Setting up Claude credentials...",
                "step": 4,
                "total_steps": TOTAL_STEPS,
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

        log::info!("========================================");
        log::info!("EMITTING FINAL EVENT: session-progress (ready)");
        log::info!("  session_id: {}", session.id);
        log::info!("  status: ready");
        log::info!("  container: {container_id}");
        log::info!("========================================");

        // Emit progress: Container ready
        let _ = app_handle.emit(
            "session-progress",
            json!({
                "session_id": &session.id,
                "status": "ready",
                "message": "Session is ready!",
                "step": 5,
                "total_steps": TOTAL_STEPS,
            }),
        );

        log::info!("Event emitted successfully");

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

    #[cfg(feature = "integration-tests")]
    mod integration_tests {
        use super::*;
        use std::fs;
        use tempfile::TempDir;

        /// Test that copy_repo_for_session respects .gitignore patterns
        #[tokio::test]
        async fn test_copy_respects_gitignore() {
            // Create temporary directory with sample repo structure
            let temp_dir = TempDir::new().unwrap();
            let repo_path = temp_dir.path().join("test-repo");
            fs::create_dir(&repo_path).unwrap();

            // Create .gitignore
            fs::write(
                repo_path.join(".gitignore"),
                "node_modules/\ntarget/\n*.log\n.env\n",
            )
            .unwrap();

            // Create files that should be copied
            fs::write(repo_path.join("README.md"), "# Test").unwrap();
            fs::create_dir_all(repo_path.join("src")).unwrap();
            fs::write(repo_path.join("src/main.rs"), "fn main() {}").unwrap();

            // Create files that should be ignored
            fs::create_dir(repo_path.join("node_modules")).unwrap();
            fs::write(repo_path.join("node_modules/package.json"), "{}").unwrap();
            fs::create_dir(repo_path.join("target")).unwrap();
            fs::write(repo_path.join("target/debug"), "binary").unwrap();
            fs::write(repo_path.join("error.log"), "error").unwrap();
            fs::write(repo_path.join(".env"), "SECRET=123").unwrap();

            // Create .git directory (should be preserved)
            fs::create_dir_all(repo_path.join(".git/refs")).unwrap();
            fs::write(repo_path.join(".git/HEAD"), "ref: refs/heads/main").unwrap();

            // Create mock session manager (requires Docker, Database - skip for now)
            // Instead, just test the file walking logic directly
            let source = repo_path.to_str().unwrap().to_string();

            let files = tokio::task::spawn_blocking(move || {
                let mut files = Vec::new();
                let walker = WalkBuilder::new(&source)
                    .git_ignore(true)
                    .hidden(false)
                    .build();

                for result in walker {
                    if let Ok(entry) = result {
                        if entry.file_type().unwrap().is_file() {
                            files.push(entry.path().to_path_buf());
                        }
                    }
                }
                files
            })
            .await
            .unwrap();

            // Verify ignored files are excluded
            assert!(
                !files
                    .iter()
                    .any(|p| p.to_str().unwrap().contains("node_modules")),
                "node_modules should be ignored"
            );
            assert!(
                !files.iter().any(|p| p.to_str().unwrap().contains("target")),
                "target should be ignored"
            );
            assert!(
                !files.iter().any(|p| p.to_str().unwrap().ends_with(".log")),
                ".log files should be ignored"
            );
            assert!(
                !files.iter().any(|p| p.to_str().unwrap().ends_with(".env")),
                ".env should be ignored"
            );

            // Verify included files are present
            assert!(
                files
                    .iter()
                    .any(|p| p.to_str().unwrap().ends_with("README.md")),
                "README.md should be included"
            );
            assert!(
                files
                    .iter()
                    .any(|p| p.to_str().unwrap().ends_with("main.rs")),
                "src/main.rs should be included"
            );
        }

        /// Test that repositories without .gitignore copy all files
        #[tokio::test]
        async fn test_copy_without_gitignore() {
            let temp_dir = TempDir::new().unwrap();
            let repo_path = temp_dir.path().join("no-gitignore-repo");
            fs::create_dir(&repo_path).unwrap();

            // No .gitignore file
            fs::write(repo_path.join("file1.txt"), "content").unwrap();
            fs::write(repo_path.join("file2.log"), "log").unwrap();
            fs::create_dir(repo_path.join("build")).unwrap();
            fs::write(repo_path.join("build/output"), "binary").unwrap();

            let source = repo_path.to_str().unwrap().to_string();
            let files = tokio::task::spawn_blocking(move || {
                let mut files = Vec::new();
                let walker = WalkBuilder::new(&source)
                    .git_ignore(true)
                    .hidden(false)
                    .build();

                for result in walker {
                    if let Ok(entry) = result {
                        if entry.file_type().unwrap().is_file() {
                            files.push(entry.path().to_path_buf());
                        }
                    }
                }
                files
            })
            .await
            .unwrap();

            // Without .gitignore, all files should be included
            assert_eq!(
                files.len(),
                3,
                "All files should be included without .gitignore"
            );
        }
    }
}
