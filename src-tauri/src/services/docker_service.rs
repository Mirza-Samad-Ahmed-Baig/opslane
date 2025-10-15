use anyhow::{anyhow, Result};
use bollard::container::{
    Config, CreateContainerOptions, RemoveContainerOptions, StartContainerOptions,
    StopContainerOptions,
};
use bollard::models::HostConfig;
use bollard::Docker;

/// Docker service for managing Claude Code session containers
#[derive(Debug)]
pub struct DockerService {
    client: Docker,
}

impl DockerService {
    /// Create new Docker service by connecting to local daemon
    pub fn new() -> Result<Self> {
        let client = Docker::connect_with_local_defaults()
            .map_err(|e| anyhow!("Failed to connect to Docker daemon: {e}"))?;
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

        // Configure volume mount: host repo -> /workspace/repo in container
        let bindings = vec![format!("{}:/workspace/repo:rw", repo_path_buf.display())];

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
}
