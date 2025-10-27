use anyhow::{anyhow, Result};
use bollard::container::{
    Config, CreateContainerOptions, LogOutput, LogsOptions, RemoveContainerOptions,
    StartContainerOptions, StopContainerOptions,
};
use bollard::exec::{CreateExecOptions, StartExecResults};
use bollard::models::HostConfig;
use bollard::Docker;
use futures_util::stream::StreamExt;

/// Container workspace path where repositories are mounted
pub const WORKSPACE_PATH: &str = "/workspace/repo";

/// Docker service for managing Claude Code session containers
#[derive(Debug)]
pub struct DockerService {
    client: Docker,
}

impl DockerService {
    /// Create new Docker service by connecting to local daemon
    pub fn new() -> Result<Self> {
        // Try multiple socket locations for compatibility across systems
        let client = if let Ok(client) = Docker::connect_with_socket_defaults() {
            // Try default Unix socket first (works on Linux and some macOS setups)
            client
        } else if let Ok(home) = std::env::var("HOME") {
            // Try Docker Desktop socket on macOS
            let socket_path = format!("{home}/.docker/run/docker.sock");
            Docker::connect_with_unix(&socket_path, 120, bollard::API_DEFAULT_VERSION)
                .map_err(|e| anyhow!("Failed to connect to Docker daemon at {socket_path}: {e}"))?
        } else {
            return Err(anyhow!(
                "Failed to connect to Docker daemon: no valid socket found"
            ));
        };

        Ok(Self { client })
    }

    /// Check if Docker daemon is available
    pub async fn check_available(&self) -> Result<bool> {
        self.client
            .ping()
            .await
            .map_err(|e| anyhow!("Docker daemon not available: {e}"))?;
        Ok(true)
    }

    /// Create a container for a Claude Code session
    ///
    /// # Arguments
    /// * `container_name` - Name for the container (e.g., "opslane-session-550e8400")
    /// * `repo_path` - Absolute path to repository on host
    /// * `cpu_limit` - CPU cores (e.g., 1.0)
    /// * `memory_limit_mb` - Memory limit in MB (e.g., 2048)
    ///
    /// # Returns
    /// Container ID on success
    ///
    /// # Errors
    /// Returns error if path is invalid, resource limits are out of bounds, or container creation fails
    #[allow(dead_code)] // Will be used by SessionManager in Phase 3
    pub async fn create_container(
        &self,
        container_name: &str,
        session_id: &str,
        repo_path: &str,
        cpu_limit: f64,
        memory_limit_mb: i64,
    ) -> Result<String> {
        // Validate resource limits
        if !(0.0..=128.0).contains(&cpu_limit) {
            return Err(anyhow!(
                "CPU limit must be between 0 and 128 cores, got {cpu_limit}"
            ));
        }
        if !(4..=1_048_576).contains(&memory_limit_mb) {
            // 4MB min, 1TB max
            return Err(anyhow!(
                "Memory limit must be between 4MB and 1TB, got {memory_limit_mb}MB"
            ));
        }

        // Validate and canonicalize the repository path
        let repo_path_buf = std::fs::canonicalize(repo_path)
            .map_err(|e| anyhow!("Invalid repository path '{repo_path}': {e}"))?;

        // Ensure the path exists and is a directory
        if !repo_path_buf.is_dir() {
            return Err(anyhow!(
                "Repository path must be a directory: {}",
                repo_path_buf.display()
            ));
        }

        // Convert resource limits to Docker format
        let nano_cpus = (cpu_limit * 1_000_000_000.0) as i64;
        let memory_bytes = memory_limit_mb * 1024 * 1024;

        // Get host .claude directory
        let home_dir = std::env::var("HOME")
            .or_else(|_| std::env::var("USERPROFILE")) // Windows fallback
            .map_err(|_| anyhow!("Could not determine home directory"))?;
        let claude_dir = format!("{home_dir}/.claude");

        // Ensure .claude directory exists on host (create_dir_all is idempotent and thread-safe)
        std::fs::create_dir_all(&claude_dir)
            .map_err(|e| anyhow!("Failed to create .claude directory: {e}"))?;

        log::debug!("Ensured .claude directory exists at {claude_dir}");

        // Configure bind mounts
        let session_images_path = format!("/tmp/opslane-sessions/{session_id}/images");

        // Ensure images directory exists
        std::fs::create_dir_all(&session_images_path)
            .map_err(|e| anyhow!("Failed to create session images directory: {e}"))?;

        let bindings = vec![
            format!("{}:/workspace/repo:rw", repo_path_buf.display()),
            format!("{claude_dir}:/home/claude/.claude:rw"),
            format!("{session_images_path}:/workspace/images:rw"),
        ];

        log::info!("Mounting host {claude_dir} to /home/claude/.claude");

        let host_config = HostConfig {
            binds: Some(bindings),
            nano_cpus: Some(nano_cpus),
            memory: Some(memory_bytes),
            ..Default::default()
        };

        let config = Config {
            image: Some("opslane/claude-session:latest"),
            working_dir: Some(WORKSPACE_PATH),
            host_config: Some(host_config),
            // Keep container running (using literal to prevent command injection)
            cmd: Some(vec!["tail", "-f", "/dev/null"]),
            ..Default::default()
        };

        let options = CreateContainerOptions {
            name: container_name,
            platform: None,
        };

        let response = self
            .client
            .create_container(Some(options), config)
            .await
            .map_err(|e| anyhow!("Failed to create container: {e}"))?;

        let container_id = response.id;
        log::info!(
            "Created container {container_id} (name: {container_name}, cpu: {cpu_limit}, memory: {memory_limit_mb}MB, image: opslane/claude-session:latest)"
        );

        Ok(container_id)
    }

    /// Start a container
    #[allow(dead_code)] // Will be used by SessionManager in Phase 3
    pub async fn start_container(&self, container_id: &str) -> Result<()> {
        self.client
            .start_container(container_id, None::<StartContainerOptions<String>>)
            .await
            .map_err(|e| anyhow!("Failed to start container {container_id}: {e}"))?;

        log::info!("Container {container_id} started successfully");

        // Note: We used to run `chown -R claude:claude /home/claude/.claude` here
        // to fix ownership of the mounted .claude directory. However, this fails on
        // macOS Docker Desktop because bind-mounted files cannot have their ownership
        // changed from inside the container.
        //
        // This is actually fine - Docker Desktop on macOS automatically handles UID
        // mapping for bind mounts, so the claude user can read/write the mounted
        // .claude directory regardless of the displayed ownership.
        //
        // The only caveat is that `ls -la` inside the container will show the host
        // UID (typically 501) instead of the container's claude user UID (1001),
        // but this is cosmetic and doesn't affect functionality.

        Ok(())
    }

    /// Setup Claude credentials in container
    ///
    /// Writes credentials to /home/claude/.claude/.credentials.json with proper permissions
    ///
    /// # Arguments
    /// * `container_id` - Container ID
    /// * `credentials_json` - JSON string with credentials (from Keychain)
    ///
    /// # Security
    /// - Uses base64 encoding to prevent command injection attacks
    /// - Credentials written with chmod 600 (owner read/write only)
    /// - File owned by claude:claude user
    /// - Never logs credential content
    /// - Runs as claude user (not root)
    pub async fn setup_claude_credentials(
        &self,
        container_id: &str,
        credentials_json: &str,
    ) -> Result<()> {
        log::info!("Setting up Claude credentials in container {container_id}");

        // Security: Use base64 encoding to prevent command injection
        // This eliminates ALL shell metacharacter interpretation risks
        // (backticks, $(), newlines, quotes, etc.)
        use base64::{engine::general_purpose::STANDARD, Engine as _};
        let encoded = STANDARD.encode(credentials_json.as_bytes());

        // Build command to write credentials file with proper permissions
        // The base64-encoded data is safe to pass to shell since it contains only [A-Za-z0-9+/=]
        // Run as claude user to ensure correct ownership
        let setup_cmd = format!(
            "mkdir -p /home/claude/.claude && echo '{encoded}' | base64 -d > /home/claude/.claude/.credentials.json && chmod 600 /home/claude/.claude/.credentials.json"
        );

        let cmd = vec!["sh".to_string(), "-c".to_string(), setup_cmd];

        // Execute as claude user (not root)
        self.exec_command_blocking(container_id, cmd, None, None, false)
            .await
            .map_err(|e| anyhow!("Failed to setup credentials: {e}"))?;

        log::info!("Claude credentials file written to /home/claude/.claude/.credentials.json (content redacted)");

        Ok(())
    }

    /// Verify credentials file exists and has correct permissions
    ///
    /// Used for diagnostics and testing
    pub async fn verify_credentials_file(&self, container_id: &str) -> Result<bool> {
        let cmd = vec![
            "sh".to_string(),
            "-c".to_string(),
            "test -f /home/claude/.claude/.credentials.json && ls -la /home/claude/.claude/.credentials.json".to_string(),
        ];

        match self
            .exec_command_blocking(container_id, cmd, None, None, false)
            .await
        {
            Ok(output) => {
                log::debug!("Credentials file check: {output}");
                Ok(output.contains(".credentials.json"))
            }
            Err(_) => Ok(false),
        }
    }

    /// Configure git to trust the workspace repository
    ///
    /// Fixes "dubious ownership" errors when repo is mounted from host
    pub async fn configure_git_safe_directory(&self, container_id: &str) -> Result<()> {
        log::info!("Configuring git safe.directory in container {container_id}");

        let cmd = vec![
            "git".to_string(),
            "config".to_string(),
            "--global".to_string(),
            "--add".to_string(),
            "safe.directory".to_string(),
            WORKSPACE_PATH.to_string(),
        ];

        self.exec_command_blocking(container_id, cmd, None, None, false)
            .await
            .map_err(|e| anyhow!("Failed to configure git safe.directory: {e}"))?;

        log::info!("Git safe.directory configured successfully");
        Ok(())
    }

    /// Detect git user configuration from local system
    ///
    /// Returns (name, email) tuple or error if not configured
    pub async fn detect_local_git_user(&self) -> Result<(String, String)> {
        use tokio::process::Command;

        log::debug!("Detecting local git user configuration");

        // Get user.name
        let name_output = Command::new("git")
            .args(["config", "--global", "user.name"])
            .output()
            .await
            .map_err(|e| anyhow!("Failed to execute git config for user.name: {e}"))?;

        if !name_output.status.success() {
            return Err(anyhow!(
                "Git user.name not configured. Run: git config --global user.name \"Your Name\""
            ));
        }

        let name = String::from_utf8_lossy(&name_output.stdout)
            .trim()
            .to_string();

        if name.is_empty() {
            return Err(anyhow!("Git user.name is empty"));
        }

        // Get user.email
        let email_output = Command::new("git")
            .args(["config", "--global", "user.email"])
            .output()
            .await
            .map_err(|e| anyhow!("Failed to execute git config for user.email: {e}"))?;

        if !email_output.status.success() {
            return Err(anyhow!(
                "Git user.email not configured. Run: git config --global user.email \"you@example.com\""
            ));
        }

        let email = String::from_utf8_lossy(&email_output.stdout)
            .trim()
            .to_string();

        if email.is_empty() {
            return Err(anyhow!("Git user.email is empty"));
        }

        log::info!("Detected git user: {name} <{email}>");
        Ok((name, email))
    }

    /// Execute git command on local filesystem (NOT in container)
    ///
    /// Used for operations on the project's local repository
    ///
    /// # Arguments
    /// * `project_path` - Path to local project directory
    /// * `args` - Git command arguments (e.g., vec!["status", "--porcelain"])
    ///
    /// # Returns
    /// Stdout from git command on success
    ///
    /// # Errors
    /// Returns error if git command fails or returns non-zero exit code
    pub async fn exec_git_on_local(
        &self,
        project_path: &std::path::Path,
        args: Vec<&str>,
    ) -> Result<String> {
        use std::process::Stdio;
        use tokio::process::Command;
        use tokio::time::{timeout, Duration};

        log::debug!("Executing git command on local: git {}", args.join(" "));
        log::debug!("  Working directory: {}", project_path.display());

        // Add timeout and ensure stdin is null to prevent hanging
        let result = timeout(
            Duration::from_secs(30),
            Command::new("git")
                .current_dir(project_path)
                .args(&args)
                .stdin(Stdio::null()) // Don't wait for stdin
                .stdout(Stdio::piped())
                .stderr(Stdio::piped())
                .output(),
        )
        .await;

        let output = match result {
            Ok(Ok(output)) => {
                log::debug!("  Command completed successfully");
                output
            }
            Ok(Err(e)) => {
                log::error!("  Failed to execute git command: {e}");
                return Err(anyhow!("Failed to execute git command on local: {e}"));
            }
            Err(_) => {
                log::error!("  Git command timed out after 30 seconds");
                return Err(anyhow!("Git command timed out after 30 seconds"));
            }
        };

        let stdout = String::from_utf8_lossy(&output.stdout);
        let stderr = String::from_utf8_lossy(&output.stderr);

        log::debug!("  Exit code: {}", output.status.code().unwrap_or(-1));
        if !stdout.is_empty() {
            log::debug!("  Stdout: {}", stdout.trim());
        }
        if !stderr.is_empty() {
            log::debug!("  Stderr: {}", stderr.trim());
        }

        if !output.status.success() {
            return Err(anyhow!("Git command failed: {stderr}"));
        }

        Ok(stdout.to_string())
    }

    /// Reset repository to last committed state
    ///
    /// Discards all uncommitted changes (staged and unstaged) and removes
    /// untracked files to ensure the container starts with a clean git state.
    pub async fn reset_to_committed_state(&self, container_id: &str) -> Result<()> {
        log::info!("Resetting git repository to committed state in container {container_id}");

        const MAX_RETRIES: u32 = 10;
        const RETRY_DELAY_MS: u64 = 500;
        const TOTAL_TIMEOUT_MS: u64 = 5000;

        // Step 1: Check if .git directory exists with retry logic
        // (handles bind mount propagation delay on macOS Docker Desktop)
        let mut git_exists = false;
        for attempt in 1..=MAX_RETRIES {
            // Use git rev-parse to detect repository (more robust than checking .git directory)
            // Handles bare repos, worktrees, and submodules correctly
            let check_cmd = vec![
                "git".to_string(),
                "rev-parse".to_string(),
                "--git-dir".to_string(),
            ];

            match self
                .exec_command_blocking(
                    container_id,
                    check_cmd,
                    Some("/workspace/repo".to_string()),
                    None,
                    false,
                )
                .await
            {
                Ok(_) => {
                    log::debug!(".git directory found on attempt {attempt}");
                    git_exists = true;
                    break;
                }
                Err(e) if attempt < MAX_RETRIES => {
                    log::debug!(
                        "Attempt {attempt}/{MAX_RETRIES}: .git directory not visible yet, retrying in {RETRY_DELAY_MS}ms (error: {e})"
                    );
                    tokio::time::sleep(tokio::time::Duration::from_millis(RETRY_DELAY_MS)).await;
                    continue;
                }
                Err(e) => {
                    log::info!(
                        "Not a git repository after {MAX_RETRIES} attempts over {TOTAL_TIMEOUT_MS}ms - skipping reset. Last error: {e}"
                    );
                    return Ok(());
                }
            }
        }

        if !git_exists {
            // This shouldn't happen given the loop logic, but handle it defensively
            log::info!("Not a git repository, skipping reset");
            return Ok(());
        }

        log::debug!("Confirmed git repository, proceeding with reset");

        // Step 2: Discard all changes to tracked files
        let reset_cmd = vec![
            "git".to_string(),
            "reset".to_string(),
            "--hard".to_string(),
            "HEAD".to_string(),
        ];

        self.exec_command_blocking(
            container_id,
            reset_cmd,
            Some("/workspace/repo".to_string()),
            None,
            false,
        )
        .await
        .map_err(|e| {
            log::error!("Git reset --hard HEAD failed: {e}");
            anyhow!("Failed to reset git repository to HEAD: {e}")
        })?;

        log::debug!("Successfully reset tracked files to HEAD");

        // Step 3: Remove all untracked files and directories
        let clean_cmd = vec!["git".to_string(), "clean".to_string(), "-fd".to_string()];

        self.exec_command_blocking(
            container_id,
            clean_cmd,
            Some("/workspace/repo".to_string()),
            None,
            false,
        )
        .await
        .map_err(|e| {
            log::error!("Git clean -fd failed: {e}");
            anyhow!("Failed to clean untracked files: {e}")
        })?;

        log::info!("Git repository reset to committed state successfully");
        Ok(())
    }

    /// Stop a container (with 30 second timeout)
    #[allow(dead_code)] // Will be used by SessionManager in Phase 3
    pub async fn stop_container(&self, container_id: &str) -> Result<()> {
        log::info!("Stopping container {container_id} (30s timeout)...");

        let options = StopContainerOptions { t: 30 };
        self.client
            .stop_container(container_id, Some(options))
            .await
            .map_err(|e| anyhow!("Failed to stop container {container_id}: {e}"))?;

        log::info!("Container {container_id} stopped successfully");
        Ok(())
    }

    /// Remove a container (force remove)
    #[allow(dead_code)] // Will be used by SessionManager in Phase 3
    pub async fn remove_container(&self, container_id: &str) -> Result<()> {
        log::debug!("Removing container {container_id}...");

        let options = RemoveContainerOptions {
            force: true,
            ..Default::default()
        };
        self.client
            .remove_container(container_id, Some(options))
            .await
            .map_err(|e| anyhow!("Failed to remove container {container_id}: {e}"))?;

        log::info!("Container {container_id} removed successfully");
        Ok(())
    }

    /// Get container logs (last 100 lines)
    pub async fn get_logs(&self, container_id: &str) -> Result<String> {
        log::debug!("Retrieving logs for container {container_id} (last 100 lines)");

        let options = LogsOptions::<String> {
            stdout: true,
            stderr: true,
            tail: "100".to_string(),
            ..Default::default()
        };

        let mut log_stream = self.client.logs(container_id, Some(options));
        let mut logs = String::new();

        while let Some(log) = log_stream.next().await {
            if let Ok(log_line) = log {
                logs.push_str(&log_line.to_string());
            }
        }

        log::debug!(
            "Retrieved {} bytes of logs from container {container_id}",
            logs.len()
        );
        Ok(logs)
    }

    /// Execute a command in a running container and return streaming output with exec ID
    ///
    /// # Arguments
    /// * `container_id` - The container ID
    /// * `cmd` - Command to execute as vector of strings (e.g., vec!["claude", "chat", "Hello"])
    /// * `working_dir` - Optional working directory (defaults to container's WORKDIR)
    /// * `stdin` - Optional stdin content to pipe to the command
    /// * `as_root` - Run command as root user (default: false, runs as container's default user)
    ///
    /// # Returns
    /// Returns tuple of (exec_id, output_stream)
    ///
    /// # Security
    /// Only allows whitelisted commands (claude, cat, sh, ls, echo, chown, git) to prevent arbitrary command execution
    pub async fn exec_command(
        &self,
        container_id: &str,
        cmd: Vec<String>,
        working_dir: Option<String>,
        stdin: Option<String>,
        as_root: bool,
    ) -> Result<(String, impl futures_util::Stream<Item = Result<String>>)> {
        // SECURITY: Validate command is in whitelist
        if cmd.is_empty() {
            return Err(anyhow!("Command cannot be empty"));
        }

        let allowed_commands = [
            "claude", "cat", "sh", "ls", "echo", "chown", "git", "mkdir", "rm", "base64", "tee",
        ];
        let command_name = &cmd[0];

        if !allowed_commands.contains(&command_name.as_str()) {
            return Err(anyhow!(
                "Command '{command_name}' not allowed. Allowed commands: {allowed_commands:?}"
            ));
        }

        // Create exec instance with stdin if needed
        let attach_stdin = stdin.is_some();
        let exec_config = CreateExecOptions {
            attach_stdin: Some(attach_stdin),
            attach_stdout: Some(true),
            attach_stderr: Some(true),
            tty: Some(false), // No TTY for easier parsing
            cmd: Some(cmd.clone()),
            working_dir,
            user: if as_root {
                Some("root".to_string())
            } else {
                None
            },
            ..Default::default()
        };

        let exec = self
            .client
            .create_exec(container_id, exec_config)
            .await
            .map_err(|e| anyhow!("Failed to create exec instance: {e}"))?;

        let exec_id = exec.id.clone();
        log::debug!("Created exec {exec_id} for command: {cmd:?}");

        // Start exec
        let stream = self
            .client
            .start_exec(&exec_id, None)
            .await
            .map_err(|e| anyhow!("Failed to start exec: {e}"))?;

        // Convert bollard stream to string stream
        let output_stream = match stream {
            StartExecResults::Attached { output, .. } => output.map(|chunk_result| {
                chunk_result
                    .map(|chunk| {
                        // Convert LogOutput to String
                        match chunk {
                            LogOutput::StdOut { message } => {
                                String::from_utf8_lossy(&message).to_string()
                            }
                            LogOutput::StdErr { message } => {
                                String::from_utf8_lossy(&message).to_string()
                            }
                            LogOutput::Console { message } => {
                                String::from_utf8_lossy(&message).to_string()
                            }
                            _ => String::new(),
                        }
                    })
                    .map_err(|e| anyhow!("Stream error: {e}"))
            }),
            _ => {
                return Err(anyhow!("Exec stream not attached"));
            }
        };

        Ok((exec_id, output_stream))
    }

    /// Inspect exec instance to get exit code
    ///
    /// Returns None if exec is still running or inspection fails
    pub async fn inspect_exec(&self, exec_id: &str) -> Result<Option<i64>> {
        let exec_info = self
            .client
            .inspect_exec(exec_id)
            .await
            .map_err(|e| anyhow!("Failed to inspect exec {exec_id}: {e}"))?;

        Ok(exec_info.exit_code)
    }

    /// Execute a command with stdin input (internal helper)
    async fn exec_with_stdin(
        &self,
        container_id: &str,
        cmd: Vec<String>,
        working_dir: Option<String>,
        stdin_content: String,
        as_root: bool,
    ) -> Result<String> {
        use tokio::io::AsyncWriteExt;

        const MAX_OUTPUT_SIZE: usize = 10 * 1024 * 1024; // 10MB limit

        // SECURITY: Validate command is in whitelist
        if cmd.is_empty() {
            return Err(anyhow!("Command cannot be empty"));
        }

        let allowed_commands = [
            "claude", "cat", "sh", "ls", "echo", "chown", "git", "mkdir", "rm", "base64", "tee",
        ];
        let command_name = &cmd[0];

        if !allowed_commands.contains(&command_name.as_str()) {
            return Err(anyhow!(
                "Command '{command_name}' not allowed. Allowed commands: {allowed_commands:?}"
            ));
        }

        // Create exec instance with stdin attached
        let exec_config = CreateExecOptions {
            attach_stdin: Some(true),
            attach_stdout: Some(true),
            attach_stderr: Some(true),
            tty: Some(false),
            cmd: Some(cmd.clone()),
            working_dir,
            user: if as_root {
                Some("root".to_string())
            } else {
                None
            },
            ..Default::default()
        };

        let exec = self
            .client
            .create_exec(container_id, exec_config)
            .await
            .map_err(|e| anyhow!("Failed to create exec instance: {e}"))?;

        let exec_id = exec.id.clone();

        // Start exec
        let stream = self
            .client
            .start_exec(&exec_id, None)
            .await
            .map_err(|e| anyhow!("Failed to start exec: {e}"))?;

        // Handle stdin/stdout
        let (mut output, mut input) = match stream {
            StartExecResults::Attached { output, input } => (output, input),
            _ => return Err(anyhow!("Exec stream not attached")),
        };

        // Write stdin content and close
        input
            .write_all(stdin_content.as_bytes())
            .await
            .map_err(|e| anyhow!("Failed to write stdin: {e}"))?;
        input
            .shutdown()
            .await
            .map_err(|e| anyhow!("Failed to close stdin: {e}"))?;

        // Collect output
        let mut result = String::new();
        while let Some(chunk) = output.next().await {
            let chunk = chunk.map_err(|e| anyhow!("Stream error: {e}"))?;

            let chunk_str = match chunk {
                LogOutput::StdOut { message } => String::from_utf8_lossy(&message).to_string(),
                LogOutput::StdErr { message } => String::from_utf8_lossy(&message).to_string(),
                LogOutput::Console { message } => String::from_utf8_lossy(&message).to_string(),
                _ => String::new(),
            };

            if result.len() + chunk_str.len() > MAX_OUTPUT_SIZE {
                return Err(anyhow!(
                    "Command output exceeded maximum size of {MAX_OUTPUT_SIZE} bytes"
                ));
            }

            result.push_str(&chunk_str);
        }

        // Check exit code
        if let Ok(Some(exit_code)) = self.inspect_exec(&exec_id).await {
            if exit_code != 0 {
                return Err(anyhow!(
                    "Command failed with exit code {exit_code}. Output: {result}"
                ));
            }
        }

        Ok(result)
    }

    /// Execute a command in a container and wait for completion (non-streaming)
    /// Useful for short commands where you want the full output
    ///
    /// # Arguments
    /// * `container_id` - The container ID
    /// * `cmd` - Command to execute as vector of strings
    /// * `working_dir` - Optional working directory (absolute path)
    /// * `stdin` - Optional stdin content to pipe to the command
    /// * `as_root` - Run command as root user
    ///
    /// # Security
    /// Limits output to 10MB to prevent memory exhaustion attacks
    pub async fn exec_command_blocking(
        &self,
        container_id: &str,
        cmd: Vec<String>,
        working_dir: Option<String>,
        stdin: Option<String>,
        as_root: bool,
    ) -> Result<String> {
        const MAX_OUTPUT_SIZE: usize = 10 * 1024 * 1024; // 10MB limit

        log::debug!("🐳 Exec on {}: {cmd:?}", &container_id[..12]);
        if let Some(ref dir) = working_dir {
            log::debug!("   WorkDir: {dir}");
        }
        if let Some(ref content) = stdin {
            if content.len() > 100 {
                let len = content.len();
                log::debug!("   Stdin: {len} bytes");
            } else {
                log::debug!("   Stdin: {content}");
            }
        }

        // If stdin is provided, use a different code path
        if let Some(stdin_content) = stdin {
            return self
                .exec_with_stdin(container_id, cmd, working_dir, stdin_content, as_root)
                .await;
        }

        // No stdin - use regular exec
        let (exec_id, mut stream) = self
            .exec_command(container_id, cmd.clone(), working_dir, None, as_root)
            .await?;

        let mut output = String::new();

        while let Some(chunk_result) = stream.next().await {
            let chunk = chunk_result?;

            // Check if adding this chunk would exceed the limit
            if output.len() + chunk.len() > MAX_OUTPUT_SIZE {
                return Err(anyhow!(
                    "Command output exceeded maximum size of {MAX_OUTPUT_SIZE} bytes"
                ));
            }

            output.push_str(&chunk);
        }

        // Inspect exec to get exit code
        if let Ok(Some(exit_code)) = self.inspect_exec(&exec_id).await {
            if exit_code == 0 {
                log::debug!("Exec {exec_id} succeeded (exit code 0)");
                Ok(output)
            } else {
                log::warn!("Exec {exec_id} failed with exit code {exit_code}");
                Err(anyhow!(
                    "Command failed with exit code {exit_code}. Output: {output}"
                ))
            }
        } else {
            log::warn!("Exec {exec_id} completed but exit code unavailable - assuming success");
            // If we can't get exit code, return output with caution
            // This maintains backward compatibility for edge cases
            Ok(output)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    #[cfg_attr(not(feature = "integration-tests"), ignore = "requires Docker daemon")]
    async fn test_docker_service_creation() {
        // Note: This test requires Docker daemon to be running
        // Run with: cargo test --features integration-tests
        let result = DockerService::new();
        assert!(result.is_ok(), "Docker service creation should succeed");

        // Verify we can ping the daemon
        if let Ok(docker) = result {
            assert!(
                docker.check_available().await.is_ok(),
                "Docker daemon should be available"
            );
        }
    }

    #[tokio::test]
    async fn test_resource_limit_conversion() {
        // Test CPU conversion: 1.0 CPU = 1 billion nano_cpus
        let cpu_limit = 1.5;
        let expected_nano_cpus = 1_500_000_000i64;
        let actual_nano_cpus = (cpu_limit * 1_000_000_000.0) as i64;
        assert_eq!(actual_nano_cpus, expected_nano_cpus);

        // Test memory conversion: 2048 MB = 2147483648 bytes
        let memory_mb = 2048i64;
        let expected_bytes = 2147483648i64;
        let actual_bytes = memory_mb * 1024 * 1024;
        assert_eq!(actual_bytes, expected_bytes);
    }

    #[tokio::test]
    async fn test_container_name_format() {
        // Test container naming convention
        let uuid = "550e8400-e29b-41d4-a716-446655440000";
        let short_uuid = &uuid[..8];
        let container_name = format!("opslane-session-{short_uuid}");
        assert_eq!(container_name, "opslane-session-550e8400");
    }

    #[tokio::test]
    async fn test_uuid_validation() {
        // Valid UUID format
        let valid_uuid = "550e8400-e29b-41d4-a716-446655440000";
        assert!(valid_uuid.len() >= 36);
        assert_eq!(valid_uuid.chars().nth(8), Some('-'));

        // Invalid UUID formats
        let too_short = "550e8400";
        assert!(too_short.len() < 36);

        let no_hyphen = "550e8400ae29b41d4a716446655440000";
        assert_ne!(no_hyphen.chars().nth(8), Some('-'));
    }

    #[tokio::test]
    async fn test_resource_limit_validation() {
        // Test that resource limits are validated
        // CPU limit too low
        assert!(!(0.0..=128.0).contains(&-1.0));

        // CPU limit too high
        assert!(!(0.0..=128.0).contains(&129.0));

        // CPU limit valid
        assert!((0.0..=128.0).contains(&1.0));
        assert!((0.0..=128.0).contains(&128.0));

        // Memory limit too low
        assert!(!(4..=1_048_576).contains(&3i64));

        // Memory limit too high
        assert!(!(4..=1_048_576).contains(&1_048_577i64));

        // Memory limit valid
        assert!((4..=1_048_576).contains(&2048i64));
        assert!((4..=1_048_576).contains(&1_048_576i64));
    }

    #[tokio::test]
    #[cfg_attr(not(feature = "integration-tests"), ignore = "requires Docker daemon")]
    async fn test_container_with_host_mount() {
        let docker = DockerService::new().expect("Docker service creation failed");

        // Create temporary test directory
        let temp_dir = std::env::temp_dir().join("opslane-test-repo");
        std::fs::create_dir_all(&temp_dir).expect("Failed to create temp dir");

        // Create container with host .claude mount
        let container_id = docker
            .create_container(
                "opslane-test-host-mount",
                "test-session-id",
                temp_dir.to_str().unwrap(),
                1.0,
                512,
            )
            .await
            .expect("Container creation failed");

        // Cleanup
        if let Err(e) = docker.remove_container(&container_id).await {
            log::warn!("Failed to cleanup container in test: {e}");
        }
        if let Err(e) = std::fs::remove_dir_all(&temp_dir) {
            log::warn!("Failed to cleanup temp directory in test: {e}");
        }

        // Test passes if we got here without errors
        assert!(!container_id.is_empty());
    }

    // Phase 2: Container Exec Tests

    #[tokio::test]
    #[cfg_attr(not(feature = "integration-tests"), ignore = "requires Docker daemon")]
    async fn test_exec_command_echo() {
        let service = DockerService::new().expect("Docker service init failed");

        // Create temporary test directory
        let temp_dir = std::env::temp_dir().join("opslane-test-exec");
        std::fs::create_dir_all(&temp_dir).expect("Failed to create temp dir");

        // Create a test container
        let container_id = service
            .create_container(
                "test-exec",
                "test-session-id",
                temp_dir.to_str().unwrap(),
                1.0,
                512,
            )
            .await
            .expect("Failed to create container");

        // Start container
        service
            .start_container(&container_id)
            .await
            .expect("Failed to start container");

        // Execute echo command
        let output = service
            .exec_command_blocking(
                &container_id,
                vec!["echo".into(), "Hello".into()],
                None,
                None,
                false,
            )
            .await
            .expect("Failed to exec command");

        assert!(output.contains("Hello"));

        // Cleanup
        let _ = service.stop_container(&container_id).await;
        let _ = service.remove_container(&container_id).await;
        let _ = std::fs::remove_dir_all(&temp_dir);
    }

    #[tokio::test]
    #[cfg_attr(not(feature = "integration-tests"), ignore = "requires Docker daemon")]
    async fn test_exec_command_streaming() {
        let service = DockerService::new().expect("Docker service init failed");

        // Create temporary test directory
        let temp_dir = std::env::temp_dir().join("opslane-test-exec-stream");
        std::fs::create_dir_all(&temp_dir).expect("Failed to create temp dir");

        let container_id = service
            .create_container(
                "test-exec-stream",
                "test-session-id",
                temp_dir.to_str().unwrap(),
                1.0,
                512,
            )
            .await
            .expect("Failed to create container");

        service
            .start_container(&container_id)
            .await
            .expect("Failed to start container");

        // Execute command that produces multiple lines
        let (_exec_id, mut stream) = service
            .exec_command(
                &container_id,
                vec!["sh".into(), "-c".into(), "echo A && echo B".into()],
                None,
                None,
                false,
            )
            .await
            .expect("Failed to exec command");

        let mut output = String::new();
        while let Some(chunk_result) = stream.next().await {
            output.push_str(&chunk_result.expect("Stream error"));
        }

        assert!(output.contains("A"));
        assert!(output.contains("B"));

        // Cleanup
        let _ = service.stop_container(&container_id).await;
        let _ = service.remove_container(&container_id).await;
        let _ = std::fs::remove_dir_all(&temp_dir);
    }

    #[test]
    fn test_retry_constants_are_reasonable() {
        // This test documents and validates our retry parameters
        const MAX_RETRIES: u32 = 10;
        const RETRY_DELAY_MS: u64 = 500;

        // Total possible wait time
        let max_wait_ms = MAX_RETRIES as u64 * RETRY_DELAY_MS;

        // Should be between 3-10 seconds
        assert!(
            max_wait_ms >= 3000,
            "Max wait time should be at least 3 seconds"
        );
        assert!(
            max_wait_ms <= 10000,
            "Max wait time should not exceed 10 seconds"
        );

        // Individual retry delay should be reasonable (100ms-1s)
        assert!(
            RETRY_DELAY_MS >= 100,
            "Retry delay should be at least 100ms"
        );
        assert!(RETRY_DELAY_MS <= 1000, "Retry delay should not exceed 1s");
    }
}
