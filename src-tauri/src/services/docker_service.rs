use anyhow::{anyhow, Result};
use bollard::container::{
    Config, CreateContainerOptions, LogsOptions, RemoveContainerOptions, StartContainerOptions,
    StopContainerOptions,
};
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
    /// * `volume_name` - Optional Docker volume name for session persistence
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
        volume_name: Option<&str>,
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

        // Configure volume mounts
        let mut bindings = vec![format!("{}:/workspace/repo:rw", repo_path_buf.display())];

        // Mount session volume if provided
        if let Some(vol) = volume_name {
            bindings.push(format!("{vol}:/home/claude/.claude:rw"));
            log::info!("Mounting volume {vol} to /home/claude/.claude");
        }

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
        Ok(())
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

    /// Create a named volume for session persistence
    ///
    /// # Arguments
    /// * `session_id` - Full session UUID (must be valid UUID format)
    ///
    /// # Returns
    /// Volume name (format: "opslane-session-{first-12-chars}")
    ///
    /// # Errors
    /// Returns error if session_id is not a valid UUID or volume creation fails
    #[allow(dead_code)] // Will be used in Phase 3
    pub async fn create_session_volume(&self, session_id: &str) -> Result<String> {
        use bollard::volume::CreateVolumeOptions;
        use std::collections::HashMap;

        // Validate UUID format (basic check: length and hyphens)
        if session_id.len() < 36 || session_id.chars().nth(8) != Some('-') {
            return Err(anyhow!("Invalid session_id format: must be a valid UUID"));
        }

        // Use first 12 chars of UUID for volume names (2^48 possibilities, reduces collision risk)
        // This balances readability with collision prevention
        let short_id = &session_id[..12];

        let volume_name = format!("opslane-session-{short_id}");

        let mut labels = HashMap::new();
        labels.insert("com.opslane.session-id".to_string(), session_id.to_string());
        labels.insert("com.opslane.managed".to_string(), "true".to_string());

        let config = CreateVolumeOptions {
            name: volume_name.clone(),
            driver: "local".to_string(),
            labels,
            ..Default::default()
        };

        self.client
            .create_volume(config)
            .await
            .map_err(|e| anyhow!("Failed to create volume {volume_name}: {e}"))?;

        log::info!("Created Docker volume: {volume_name}");
        Ok(volume_name)
    }

    /// Remove a session volume
    ///
    /// # Arguments
    /// * `volume_name` - Volume name to remove
    ///
    /// # Safety
    /// This method uses force removal (`force: true`), which will remove the volume
    /// even if it's currently in use by a container. This is intentional for cleanup
    /// during session deletion, but callers should ensure containers are stopped first
    /// to prevent data corruption.
    ///
    /// # Errors
    /// Returns error if volume removal fails or volume doesn't exist
    #[allow(dead_code)] // Will be used in Phase 3
    pub async fn remove_volume(&self, volume_name: &str) -> Result<()> {
        use bollard::volume::RemoveVolumeOptions;

        log::warn!("Force removing Docker volume: {volume_name}");

        self.client
            .remove_volume(volume_name, Some(RemoveVolumeOptions { force: true }))
            .await
            .map_err(|e| anyhow!("Failed to remove volume {volume_name}: {e}"))?;

        log::info!("Removed Docker volume: {volume_name}");
        Ok(())
    }

    /// Check if a volume exists
    #[allow(dead_code)] // Will be used in Phase 3
    pub async fn volume_exists(&self, volume_name: &str) -> Result<bool> {
        use bollard::volume::ListVolumesOptions;
        use std::collections::HashMap;

        let mut filters = HashMap::new();
        filters.insert("name".to_string(), vec![volume_name.to_string()]);

        let options = Some(ListVolumesOptions { filters });

        let volumes = self
            .client
            .list_volumes(options)
            .await
            .map_err(|e| anyhow!("Failed to list volumes: {e}"))?;

        Ok(volumes.volumes.is_some_and(|v| !v.is_empty()))
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
    async fn test_volume_name_format() {
        // Test volume naming convention (12 chars for collision prevention)
        let uuid = "550e8400-e29b-41d4-a716-446655440000";
        let short_uuid = &uuid[..12];
        let volume_name = format!("opslane-session-{short_uuid}");
        assert_eq!(volume_name, "opslane-session-550e8400-e29");
        assert_eq!(volume_name.len(), 28); // "opslane-session-" (16) + 12 chars
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

    // Phase 4: Volume Management Tests

    #[tokio::test]
    #[cfg_attr(not(feature = "integration-tests"), ignore = "requires Docker daemon")]
    async fn test_create_and_remove_volume() {
        let docker = DockerService::new().expect("Docker service creation failed");
        let session_id = "550e8400-e29b-41d4-a716-446655440000";

        // Create volume
        let volume_name = docker
            .create_session_volume(session_id)
            .await
            .expect("Volume creation failed");

        assert_eq!(volume_name, "opslane-session-550e8400-e29");

        // Verify volume exists
        let exists = docker
            .volume_exists(&volume_name)
            .await
            .expect("Volume check failed");
        assert!(exists, "Volume should exist after creation");

        // Remove volume
        docker
            .remove_volume(&volume_name)
            .await
            .expect("Volume removal failed");

        // Verify volume removed
        let exists = docker
            .volume_exists(&volume_name)
            .await
            .expect("Volume check failed");
        assert!(!exists, "Volume should not exist after removal");
    }

    #[tokio::test]
    #[cfg_attr(not(feature = "integration-tests"), ignore = "requires Docker daemon")]
    async fn test_container_with_volume_mount() {
        let docker = DockerService::new().expect("Docker service creation failed");
        let session_id = "7c9e6679-7425-40de-944b-e07fc1f90ae7";

        // Create volume
        let volume_name = docker
            .create_session_volume(session_id)
            .await
            .expect("Volume creation failed");

        // Create temporary test directory
        let temp_dir = std::env::temp_dir().join("opslane-test-repo");
        std::fs::create_dir_all(&temp_dir).expect("Failed to create temp dir");

        // Create container with volume
        let container_id = docker
            .create_container(
                "opslane-test-volume-mount",
                temp_dir.to_str().unwrap(),
                Some(&volume_name),
                1.0,
                512,
            )
            .await
            .expect("Container creation failed");

        // Cleanup
        if let Err(e) = docker.remove_container(&container_id).await {
            log::warn!("Failed to cleanup container in test: {e}");
        }
        if let Err(e) = docker.remove_volume(&volume_name).await {
            log::warn!("Failed to cleanup volume in test: {e}");
        }
        if let Err(e) = std::fs::remove_dir_all(&temp_dir) {
            log::warn!("Failed to cleanup temp directory in test: {e}");
        }

        // Test passes if we got here without errors
        assert!(!container_id.is_empty());
    }

    #[tokio::test]
    #[cfg_attr(not(feature = "integration-tests"), ignore = "requires Docker daemon")]
    async fn test_invalid_session_id_format() {
        let docker = match DockerService::new() {
            Ok(d) => d,
            Err(_) => {
                // Skip test if Docker is not available
                // This allows the test to be ignored gracefully in CI/CD
                return;
            }
        };

        // Too short
        let result = docker.create_session_volume("short").await;
        assert!(result.is_err(), "Should reject session_id that's too short");

        // Missing hyphen at position 8
        let result = docker
            .create_session_volume("550e8400ae29b41d4a716446655440000")
            .await;
        assert!(
            result.is_err(),
            "Should reject session_id without hyphen at position 8"
        );
    }
}
