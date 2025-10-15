//! Integration test for session lifecycle with Docker volumes
//! Run with: cargo test --test integration_session_lifecycle --features integration-tests
//!
//! These tests verify the integration between Database and Docker services
//! for session persistence using volumes.

#[cfg(test)]
#[cfg(feature = "integration-tests")]
mod session_lifecycle_tests {
    use app_lib::database::Database;
    use app_lib::models::NewSession;
    use app_lib::services::docker_service::DockerService;

    #[tokio::test]
    async fn test_database_and_volume_integration() {
        let db = Database::init_with_url("sqlite::memory:")
            .await
            .expect("Database init failed");

        let docker = DockerService::new().expect("Docker service init failed");

        // 1. Create session in database
        let new_session = NewSession {
            name: "Volume Integration Test".to_string(),
            local_repo_path: "/tmp/test-repo".to_string(),
            base_branch: "main".to_string(),
        };

        let session = db.create_session(new_session).await.unwrap();
        assert!(
            session.volume_name.is_none(),
            "New session should have no volume"
        );

        // 2. Create Docker volume
        let volume_name = docker
            .create_session_volume(&session.id)
            .await
            .expect("Volume creation failed");

        // 3. Update session with volume name
        db.update_session_volume(&session.id, &volume_name)
            .await
            .expect("Failed to update session volume");

        // 4. Verify volume exists
        let exists = docker.volume_exists(&volume_name).await.unwrap();
        assert!(exists, "Volume should exist after creation");

        // 5. Retrieve session and verify volume name stored
        let updated_session = db.get_session(&session.id).await.unwrap();
        assert_eq!(
            updated_session.volume_name,
            Some(volume_name.clone()),
            "Session should have volume name stored"
        );

        // 6. Cleanup: Remove volume
        docker
            .remove_volume(&volume_name)
            .await
            .expect("Volume removal failed");

        // 7. Verify volume removed
        let exists = docker.volume_exists(&volume_name).await.unwrap();
        assert!(!exists, "Volume should not exist after removal");

        db.close().await;
    }

    #[tokio::test]
    async fn test_volume_persistence_lifecycle() {
        let db = Database::init_with_url("sqlite::memory:")
            .await
            .expect("Database init failed");

        let docker = DockerService::new().expect("Docker service init failed");

        // Create session
        let new_session = NewSession {
            name: "Persistence Test".to_string(),
            local_repo_path: "/tmp/persistence-test".to_string(),
            base_branch: "main".to_string(),
        };

        let session = db.create_session(new_session).await.unwrap();

        // Create and link volume
        let volume_name = docker.create_session_volume(&session.id).await.unwrap();
        db.update_session_volume(&session.id, &volume_name)
            .await
            .unwrap();

        // Verify volume exists
        assert!(
            docker.volume_exists(&volume_name).await.unwrap(),
            "Volume should exist"
        );

        // Simulate session deletion: remove volume
        docker.remove_volume(&volume_name).await.unwrap();

        // Verify volume removed
        assert!(
            !docker.volume_exists(&volume_name).await.unwrap(),
            "Volume should be removed"
        );

        db.close().await;
    }

    #[tokio::test]
    async fn test_multiple_sessions_independent_volumes() {
        let db = Database::init_with_url("sqlite::memory:")
            .await
            .expect("Database init failed");

        let docker = DockerService::new().expect("Docker service init failed");

        // Create 3 sessions with volumes
        let mut volumes = vec![];

        for i in 1..=3 {
            let new_session = NewSession {
                name: format!("Multi Session {i}"),
                local_repo_path: format!("/tmp/multi-test-{i}"),
                base_branch: "main".to_string(),
            };

            let session = db.create_session(new_session).await.unwrap();
            let volume_name = docker.create_session_volume(&session.id).await.unwrap();

            db.update_session_volume(&session.id, &volume_name)
                .await
                .unwrap();

            volumes.push(volume_name);
        }

        // Verify all 3 volumes exist
        for volume_name in &volumes {
            let exists = docker.volume_exists(volume_name).await.unwrap();
            assert!(exists, "Volume {volume_name} should exist");
        }

        // Delete first volume
        docker.remove_volume(&volumes[0]).await.unwrap();

        // Verify first volume gone, others remain
        assert!(
            !docker.volume_exists(&volumes[0]).await.unwrap(),
            "First volume should be removed"
        );
        assert!(
            docker.volume_exists(&volumes[1]).await.unwrap(),
            "Second volume should still exist"
        );
        assert!(
            docker.volume_exists(&volumes[2]).await.unwrap(),
            "Third volume should still exist"
        );

        // Cleanup remaining volumes
        for volume_name in &volumes[1..] {
            if let Err(e) = docker.remove_volume(volume_name).await {
                log::warn!("Failed to cleanup volume in test: {}", e);
            }
        }

        db.close().await;
    }

    #[tokio::test]
    async fn test_claude_session_id_tracking() {
        let db = Database::init_with_url("sqlite::memory:")
            .await
            .expect("Database init failed");

        // Create session
        let new_session = NewSession {
            name: "Claude ID Test".to_string(),
            local_repo_path: "/tmp/claude-id-test".to_string(),
            base_branch: "main".to_string(),
        };

        let session = db.create_session(new_session).await.unwrap();
        assert!(
            session.claude_session_id.is_none(),
            "New session should have no Claude session ID"
        );

        // Simulate storing Claude session ID after first run
        let claude_id = "claude-session-abc123def456";
        db.update_claude_session_id(&session.id, claude_id)
            .await
            .unwrap();

        // Verify stored
        let updated = db.get_session(&session.id).await.unwrap();
        assert_eq!(
            updated.claude_session_id,
            Some(claude_id.to_string()),
            "Claude session ID should be stored"
        );

        db.close().await;
    }

    #[tokio::test]
    async fn test_last_activity_tracking() {
        let db = Database::init_with_url("sqlite::memory:")
            .await
            .expect("Database init failed");

        // Create session
        let new_session = NewSession {
            name: "Activity Test".to_string(),
            local_repo_path: "/tmp/activity-test".to_string(),
            base_branch: "main".to_string(),
        };

        let session = db.create_session(new_session).await.unwrap();

        // Update status to 'ready' triggers last_activity_at update
        db.update_session_status(&session.id, "ready")
            .await
            .unwrap();

        // Verify last_activity_at is set
        let updated = db.get_session(&session.id).await.unwrap();
        assert!(
            updated.last_activity_at.is_some(),
            "last_activity_at should be set after status change to 'ready'"
        );

        db.close().await;
    }
}
