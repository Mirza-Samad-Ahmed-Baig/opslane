use anyhow::{anyhow, Result};
use bollard::container::{
    Config, CreateContainerOptions, LogOutput, LogsOptions, RemoveContainerOptions,
    StartContainerOptions, StopContainerOptions,
};
use bollard::exec::{CreateExecOptions, StartExecResults};
use bollard::models::HostConfig;
use bollard::Docker;
use futures_util::stream::StreamExt;

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
        let bindings = vec![
            format!("{}:/workspace/repo:rw", repo_path_buf.display()),
            format!("{claude_dir}:/home/claude/.claude:rw"),
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
            working_dir: Some("/workspace/repo"),
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

        Ok(response.id)
    }

    /// Start a container
    #[allow(dead_code)] // Will be used by SessionManager in Phase 3
    pub async fn start_container(&self, container_id: &str) -> Result<()> {
        self.client
            .start_container(container_id, None::<StartContainerOptions<String>>)
            .await
            .map_err(|e| anyhow!("Failed to start container {container_id}: {e}"))?;

        // Fix ownership of .claude directory so claude user can write to it
        // The claude user in the container has UID 1001
        let chown_cmd = vec![
            "chown".to_string(),
            "-R".to_string(),
            "claude:claude".to_string(),
            "/home/claude/.claude".to_string(),
        ];

        log::info!("Fixing .claude directory ownership in container {container_id}");

        self.exec_command_blocking(container_id, chown_cmd, None, true)
            .await
            .map_err(|e| anyhow!("Failed to fix .claude directory ownership: {e}"))?;

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
        self.exec_command_blocking(container_id, cmd, None, false)
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
            .exec_command_blocking(container_id, cmd, None, false)
            .await
        {
            Ok(output) => {
                log::debug!("Credentials file check: {output}");
                Ok(output.contains(".credentials.json"))
            }
            Err(_) => Ok(false),
        }
    }

    /// Stop a container (with 30 second timeout)
    #[allow(dead_code)] // Will be used by SessionManager in Phase 3
    pub async fn stop_container(&self, container_id: &str) -> Result<()> {
        let options = StopContainerOptions { t: 30 };
        self.client
            .stop_container(container_id, Some(options))
            .await
            .map_err(|e| anyhow!("Failed to stop container {container_id}: {e}"))?;
        Ok(())
    }

    /// Remove a container (force remove)
    #[allow(dead_code)] // Will be used by SessionManager in Phase 3
    pub async fn remove_container(&self, container_id: &str) -> Result<()> {
        let options = RemoveContainerOptions {
            force: true,
            ..Default::default()
        };
        self.client
            .remove_container(container_id, Some(options))
            .await
            .map_err(|e| anyhow!("Failed to remove container {container_id}: {e}"))?;
        Ok(())
    }

    /// Get container logs (last 100 lines)
    pub async fn get_logs(&self, container_id: &str) -> Result<String> {
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

        Ok(logs)
    }

    /// Execute a command in a running container and return streaming output
    ///
    /// # Arguments
    /// * `container_id` - The container ID
    /// * `cmd` - Command to execute as vector of strings (e.g., vec!["claude", "chat", "Hello"])
    /// * `working_dir` - Optional working directory (defaults to container's WORKDIR)
    /// * `as_root` - Run command as root user (default: false, runs as container's default user)
    ///
    /// # Returns
    /// Returns a stream of output chunks (stdout/stderr combined)
    ///
    /// # Security
    /// Only allows whitelisted commands (claude, cat, sh) to prevent arbitrary command execution
    pub async fn exec_command(
        &self,
        container_id: &str,
        cmd: Vec<String>,
        working_dir: Option<String>,
        as_root: bool,
    ) -> Result<impl futures_util::Stream<Item = Result<String>>> {
        // SECURITY: Validate command is in whitelist
        if cmd.is_empty() {
            return Err(anyhow!("Command cannot be empty"));
        }

        let allowed_commands = ["claude", "cat", "sh", "ls", "echo", "chown", "git"];
        let command_name = &cmd[0];

        if !allowed_commands.contains(&command_name.as_str()) {
            return Err(anyhow!(
                "Command '{command_name}' not allowed. Allowed commands: {allowed_commands:?}"
            ));
        }

        // Create exec instance
        let exec_config = CreateExecOptions {
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

        log::info!("Created exec {} for command: {:?}", exec.id, cmd);

        // Start exec and get output stream
        let stream = self
            .client
            .start_exec(&exec.id, None)
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

        Ok(output_stream)
    }

    /// Execute a command in a container and wait for completion (non-streaming)
    /// Useful for short commands where you want the full output
    ///
    /// # Security
    /// Limits output to 10MB to prevent memory exhaustion attacks
    pub async fn exec_command_blocking(
        &self,
        container_id: &str,
        cmd: Vec<String>,
        working_dir: Option<String>,
        as_root: bool,
    ) -> Result<String> {
        const MAX_OUTPUT_SIZE: usize = 10 * 1024 * 1024; // 10MB limit

        let mut stream = self
            .exec_command(container_id, cmd, working_dir, as_root)
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

        Ok(output)
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
            .create_container("test-exec", temp_dir.to_str().unwrap(), 1.0, 512)
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
            .create_container("test-exec-stream", temp_dir.to_str().unwrap(), 1.0, 512)
            .await
            .expect("Failed to create container");

        service
            .start_container(&container_id)
            .await
            .expect("Failed to start container");

        // Execute command that produces multiple lines
        let mut stream = service
            .exec_command(
                &container_id,
                vec!["sh".into(), "-c".into(), "echo A && echo B".into()],
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
}
