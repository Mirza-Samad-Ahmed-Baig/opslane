use anyhow::Result;
use sqlx::migrate::MigrateDatabase;
use sqlx::sqlite::{SqlitePool, SqlitePoolOptions};
use std::path::PathBuf;

/// Database service - minimal implementation for Phase 0
#[derive(Clone)]
pub struct Database {
    pool: SqlitePool,
}

impl Database {
    /// Initialize database and run migrations
    pub async fn init() -> Result<Self> {
        let db_path = Self::get_database_path()?;
        let db_url = format!("sqlite:{}", db_path.display());

        // Create database if not exists
        if !sqlx::Sqlite::database_exists(&db_url).await? {
            log::info!("Creating database at: {}", db_path.display());
            sqlx::Sqlite::create_database(&db_url).await?;
        }

        Self::connect_and_migrate(&db_url).await
    }

    /// Initialize database with custom URL (for testing)
    #[cfg(test)]
    pub async fn init_with_url(db_url: &str) -> Result<Self> {
        Self::connect_and_migrate(db_url).await
    }

    /// Connect to database and run migrations
    async fn connect_and_migrate(db_url: &str) -> Result<Self> {
        // Connect with minimal pool (just 3 connections for now)
        let pool = SqlitePoolOptions::new()
            .max_connections(3)
            .connect(db_url)
            .await?;

        // Run migrations
        log::info!("Running database migrations");
        sqlx::migrate!("./migrations").run(&pool).await?;

        log::info!("Database initialized successfully");

        Ok(Self { pool })
    }

    /// Get platform-specific database path
    fn get_database_path() -> Result<PathBuf> {
        let data_dir = if cfg!(target_os = "macos") {
            dirs::data_local_dir()
                .ok_or_else(|| anyhow::anyhow!("Could not find local data directory"))?
                .join("com.opslane.app")
        } else if cfg!(target_os = "windows") {
            dirs::config_dir()
                .ok_or_else(|| anyhow::anyhow!("Could not find config directory"))?
                .join("com.opslane.app")
        } else {
            // Linux
            dirs::data_local_dir()
                .ok_or_else(|| anyhow::anyhow!("Could not find local data directory"))?
                .join("opslane")
        };

        std::fs::create_dir_all(&data_dir)?;
        Ok(data_dir.join("opslane.db"))
    }

    /// Get reference to connection pool
    pub fn pool(&self) -> &SqlitePool {
        &self.pool
    }

    /// Close database connection
    #[allow(dead_code)]
    pub async fn close(self) {
        self.pool.close().await;
    }

    /// Create a new session
    #[allow(dead_code)]
    pub async fn create_session(
        &self,
        new: crate::models::NewSession,
    ) -> Result<crate::models::Session> {
        use uuid::Uuid;

        // Validate input
        new.validate()
            .map_err(|e| anyhow::anyhow!("Validation error: {e}"))?;

        let id = Uuid::new_v4().to_string();

        let session = sqlx::query_as::<_, crate::models::Session>(
            r#"
            INSERT INTO sessions (
                id, project_id, name, base_branch, initial_message, status, is_deleted,
                is_sync_active, sync_activated_at, sync_deactivated_at
            ) VALUES (?, ?, ?, ?, ?, 'created', 0, 0, NULL, NULL)
            RETURNING id, project_id, name, session_repo_path, base_branch,
                      container_id, container_name, container_branch,
                      status, error_message, volume_name, claude_session_id,
                      last_activity_at, initial_message,
                      created_at, updated_at, is_deleted,
                      last_sync_at, sync_status,
                      is_sync_active, sync_activated_at, sync_deactivated_at
            "#,
        )
        .bind(&id)
        .bind(&new.project_id)
        .bind(&new.name)
        .bind(&new.base_branch)
        .bind(&new.initial_message)
        .fetch_one(&self.pool)
        .await?;

        log::info!("Created session: {} ({})", session.name, session.id);

        Ok(session)
    }

    /// List all sessions (joined with project info)
    pub async fn list_sessions(&self) -> Result<Vec<crate::models::Session>> {
        let sessions = sqlx::query_as::<_, crate::models::Session>(
            r#"
            SELECT s.id, s.project_id, s.name, s.session_repo_path, s.base_branch,
                   s.container_id, s.container_name, s.container_branch,
                   s.status, s.error_message, s.volume_name, s.claude_session_id,
                   s.last_activity_at, s.initial_message,
                   s.created_at, s.updated_at, s.is_deleted,
                   s.last_sync_at, s.sync_status,
                   s.is_sync_active, s.sync_activated_at, s.sync_deactivated_at
            FROM sessions s
            WHERE s.is_deleted = 0
            ORDER BY s.created_at DESC
            "#,
        )
        .fetch_all(&self.pool)
        .await?;

        Ok(sessions)
    }

    /// Get session by ID
    #[allow(dead_code)]
    pub async fn get_session(&self, id: &str) -> Result<crate::models::Session> {
        let session = sqlx::query_as::<_, crate::models::Session>(
            r#"
            SELECT id, project_id, name, session_repo_path, base_branch,
                   container_id, container_name, container_branch,
                   status, error_message, volume_name, claude_session_id,
                   last_activity_at, initial_message,
                   created_at, updated_at, is_deleted,
                   last_sync_at, sync_status,
                   is_sync_active, sync_activated_at, sync_deactivated_at
            FROM sessions
            WHERE id = ? AND is_deleted = 0
            "#,
        )
        .bind(id)
        .fetch_one(&self.pool)
        .await?;

        Ok(session)
    }

    /// Update session status
    #[allow(dead_code)]
    pub async fn update_session_status(&self, id: &str, status: &str) -> Result<()> {
        // Validate status
        if !crate::models::Session::is_valid_status(status) {
            return Err(anyhow::anyhow!("Invalid status: {status}"));
        }

        sqlx::query(
            r#"
            UPDATE sessions
            SET status = ?
            WHERE id = ?
            "#,
        )
        .bind(status)
        .bind(id)
        .execute(&self.pool)
        .await?;

        Ok(())
    }

    /// Update session status and error message
    #[allow(dead_code)]
    pub async fn update_session_error(&self, id: &str, error_message: &str) -> Result<()> {
        sqlx::query(
            r#"
            UPDATE sessions
            SET status = 'error', error_message = ?
            WHERE id = ?
            "#,
        )
        .bind(error_message)
        .bind(id)
        .execute(&self.pool)
        .await?;

        Ok(())
    }

    /// Update session container information
    #[allow(dead_code)]
    pub async fn update_session_container(
        &self,
        id: &str,
        container_id: &str,
        container_name: &str,
        container_branch: &str,
    ) -> Result<()> {
        sqlx::query(
            r#"
            UPDATE sessions
            SET
                container_id = ?,
                container_name = ?,
                container_branch = ?
            WHERE id = ?
            "#,
        )
        .bind(container_id)
        .bind(container_name)
        .bind(container_branch)
        .bind(id)
        .execute(&self.pool)
        .await?;

        Ok(())
    }

    /// Update session repo path (where we copied the repo for this session)
    #[allow(dead_code)]
    pub async fn update_session_repo_path(&self, session_id: &str, repo_path: &str) -> Result<()> {
        sqlx::query(
            r#"
            UPDATE sessions
            SET session_repo_path = ?
            WHERE id = ?
            "#,
        )
        .bind(repo_path)
        .bind(session_id)
        .execute(&self.pool)
        .await?;

        Ok(())
    }

    /// Delete session (soft delete)
    #[allow(dead_code)]
    pub async fn delete_session(&self, id: &str) -> Result<()> {
        sqlx::query(
            r#"
            UPDATE sessions
            SET is_deleted = 1
            WHERE id = ?
            "#,
        )
        .bind(id)
        .execute(&self.pool)
        .await?;

        Ok(())
    }

    /// Update session volume information
    #[allow(dead_code)]
    pub async fn update_session_volume(&self, session_id: &str, volume_name: &str) -> Result<()> {
        sqlx::query(
            r#"
            UPDATE sessions
            SET volume_name = ?
            WHERE id = ?
            "#,
        )
        .bind(volume_name)
        .bind(session_id)
        .execute(&self.pool)
        .await?;

        Ok(())
    }

    /// Update Claude session ID (after first run)
    #[allow(dead_code)]
    pub async fn update_claude_session_id(
        &self,
        session_id: &str,
        claude_session_id: &str,
    ) -> Result<()> {
        sqlx::query(
            r#"
            UPDATE sessions
            SET claude_session_id = ?
            WHERE id = ?
            "#,
        )
        .bind(claude_session_id)
        .bind(session_id)
        .execute(&self.pool)
        .await?;

        Ok(())
    }

    /// Update last activity timestamp for a session
    #[allow(dead_code)]
    pub async fn update_session_activity(&self, session_id: &str) -> Result<()> {
        sqlx::query(
            r#"
            UPDATE sessions
            SET last_activity_at = datetime('now'), updated_at = datetime('now')
            WHERE id = ? AND is_deleted = 0
            "#,
        )
        .bind(session_id)
        .execute(&self.pool)
        .await?;

        Ok(())
    }

    /// Update session sync status and timestamp
    pub async fn update_session_sync(&self, session_id: &str, sync_status: &str) -> Result<()> {
        // Validate sync_status
        let valid_statuses = ["idle", "syncing", "synced", "error"];
        if !valid_statuses.contains(&sync_status) {
            return Err(anyhow::anyhow!("Invalid sync status: {sync_status}"));
        }

        let now = chrono::Utc::now().to_rfc3339();

        sqlx::query(
            r#"
            UPDATE sessions
            SET sync_status = ?, last_sync_at = ?, updated_at = datetime('now')
            WHERE id = ?
            "#,
        )
        .bind(sync_status)
        .bind(&now)
        .bind(session_id)
        .execute(&self.pool)
        .await?;

        Ok(())
    }

    /// Update session name/title
    #[allow(dead_code)]
    pub async fn update_session_name(&self, session_id: &str, name: &str) -> Result<()> {
        // Validate name length
        if name.is_empty() {
            return Err(anyhow::anyhow!("Session name cannot be empty"));
        }
        if name.len() > 100 {
            return Err(anyhow::anyhow!("Session name too long (max 100 chars)"));
        }

        sqlx::query(
            r#"
            UPDATE sessions
            SET name = ?, updated_at = datetime('now')
            WHERE id = ?
            "#,
        )
        .bind(name)
        .bind(session_id)
        .execute(&self.pool)
        .await?;

        Ok(())
    }

    // ============================================================================
    // Projects
    // ============================================================================

    /// Get or create a project by repository path
    /// If project exists, updates last_opened_at. If not, creates new project.
    pub async fn get_or_create_project(
        &self,
        local_repo_path: &str,
    ) -> Result<crate::models::Project> {
        use uuid::Uuid;

        // Extract folder name from path
        let name = crate::models::NewProject::extract_folder_name(local_repo_path);

        // Try to find existing project
        let existing = sqlx::query_as::<_, crate::models::Project>(
            r#"
            SELECT id, name, local_repo_path, last_opened_at, created_at, updated_at, is_deleted,
                   active_sync_session_id, active_sync_started_at
            FROM projects
            WHERE local_repo_path = ? AND is_deleted = 0
            "#,
        )
        .bind(local_repo_path)
        .fetch_optional(&self.pool)
        .await?;

        if let Some(mut project) = existing {
            // Update last_opened_at
            sqlx::query(
                r#"
                UPDATE projects
                SET last_opened_at = datetime('now')
                WHERE id = ?
                "#,
            )
            .bind(&project.id)
            .execute(&self.pool)
            .await?;

            // Update the returned struct
            project.last_opened_at = Some(chrono::Utc::now().to_rfc3339());

            log::info!(
                "Reusing existing project: {} ({})",
                project.name,
                project.id
            );
            return Ok(project);
        }

        // Create new project
        let id = Uuid::new_v4().to_string();

        let project = sqlx::query_as::<_, crate::models::Project>(
            r#"
            INSERT INTO projects (id, name, local_repo_path, last_opened_at, is_deleted,
                                 active_sync_session_id, active_sync_started_at)
            VALUES (?, ?, ?, datetime('now'), 0, NULL, NULL)
            RETURNING id, name, local_repo_path, last_opened_at, created_at, updated_at, is_deleted,
                      active_sync_session_id, active_sync_started_at
            "#,
        )
        .bind(&id)
        .bind(&name)
        .bind(local_repo_path)
        .fetch_one(&self.pool)
        .await?;

        log::info!("Created new project: {} ({})", project.name, project.id);

        Ok(project)
    }

    /// List all projects ordered by recently opened
    pub async fn list_projects(&self) -> Result<Vec<crate::models::Project>> {
        let projects = sqlx::query_as::<_, crate::models::Project>(
            r#"
            SELECT id, name, local_repo_path, last_opened_at, created_at, updated_at, is_deleted,
                   active_sync_session_id, active_sync_started_at
            FROM projects
            WHERE is_deleted = 0
            ORDER BY last_opened_at DESC NULLS LAST, created_at DESC
            LIMIT 50
            "#,
        )
        .fetch_all(&self.pool)
        .await?;

        Ok(projects)
    }

    /// Get a single project by ID
    pub async fn get_project(&self, id: &str) -> Result<crate::models::Project> {
        let project = sqlx::query_as::<_, crate::models::Project>(
            r#"
            SELECT id, name, local_repo_path, last_opened_at, created_at, updated_at, is_deleted,
                   active_sync_session_id, active_sync_started_at
            FROM projects
            WHERE id = ? AND is_deleted = 0
            "#,
        )
        .bind(id)
        .fetch_one(&self.pool)
        .await?;

        Ok(project)
    }

    /// Delete a project (soft delete, cascades to sessions via DB trigger)
    pub async fn delete_project(&self, id: &str) -> Result<()> {
        sqlx::query(
            r#"
            UPDATE projects
            SET is_deleted = 1
            WHERE id = ?
            "#,
        )
        .bind(id)
        .execute(&self.pool)
        .await?;

        log::info!("Deleted project: {id}");

        Ok(())
    }

    /// List sessions for a specific project
    pub async fn list_sessions_by_project(
        &self,
        project_id: &str,
    ) -> Result<Vec<crate::models::Session>> {
        let sessions = sqlx::query_as::<_, crate::models::Session>(
            r#"
            SELECT id, project_id, name, session_repo_path, base_branch,
                   container_id, container_name, container_branch,
                   status, error_message, volume_name, claude_session_id,
                   last_activity_at, initial_message,
                   created_at, updated_at, is_deleted,
                   last_sync_at, sync_status
            FROM sessions
            WHERE project_id = ? AND is_deleted = 0
            ORDER BY created_at DESC
            "#,
        )
        .bind(project_id)
        .fetch_all(&self.pool)
        .await?;

        Ok(sessions)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Helper to create a clean test database
    async fn setup_test_db() -> Database {
        // Use in-memory database for each test
        let db_url = "sqlite::memory:";
        Database::init_with_url(db_url)
            .await
            .expect("Failed to initialize test database")
    }

    /// Helper to create a test project
    async fn create_test_project(db: &Database, path: &str) -> crate::models::Project {
        db.get_or_create_project(path)
            .await
            .expect("Failed to create test project")
    }

    #[tokio::test]
    async fn test_database_init() {
        let db = setup_test_db().await;

        // Test basic query
        let result: (i32,) = sqlx::query_as("SELECT 1")
            .fetch_one(db.pool())
            .await
            .unwrap();

        assert_eq!(result.0, 1);

        db.close().await;
    }

    #[tokio::test]
    async fn test_sessions_table_exists() {
        let db = setup_test_db().await;

        // Query to check if sessions table exists
        let result: Result<(i64,), sqlx::Error> = sqlx::query_as(
            "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='sessions'",
        )
        .fetch_one(db.pool())
        .await;

        assert!(result.is_ok());
        let (count,) = result.unwrap();
        assert_eq!(count, 1, "sessions table should exist");

        db.close().await;
    }

    #[tokio::test]
    async fn test_sessions_table_schema() {
        let db = setup_test_db().await;

        // Verify table has correct columns
        let result: Result<Vec<(String,)>, sqlx::Error> =
            sqlx::query_as("SELECT name FROM pragma_table_info('sessions') ORDER BY cid")
                .fetch_all(db.pool())
                .await;

        assert!(result.is_ok());
        let columns: Vec<String> = result.unwrap().into_iter().map(|(name,)| name).collect();

        let expected_columns = vec![
            "id",
            "project_id",
            "name",
            "session_repo_path",
            "base_branch",
            "container_id",
            "container_name",
            "container_branch",
            "status",
            "error_message",
            "volume_name",
            "claude_session_id",
            "last_activity_at",
            "initial_message",
            "created_at",
            "updated_at",
            "is_deleted",
            "last_sync_at",
            "sync_status",
            "is_sync_active",
            "sync_activated_at",
            "sync_deactivated_at",
        ];

        assert_eq!(
            columns, expected_columns,
            "Table should have correct columns in correct order"
        );

        db.close().await;
    }

    #[tokio::test]
    async fn test_create_session() {
        let db = setup_test_db().await;

        use crate::models::NewSession;

        // First create a project
        let project = create_test_project(&db, "/tmp/test-repo").await;

        let new_session = NewSession {
            project_id: project.id.clone(),
            name: "Test Session".to_string(),
            base_branch: "main".to_string(),
            initial_message: None,
        };

        let session = db.create_session(new_session).await.unwrap();

        assert_eq!(session.name, "Test Session");
        assert_eq!(session.project_id, project.id);
        assert_eq!(session.base_branch, "main");
        assert_eq!(session.status, "created");
        assert!(!session.is_deleted);
        assert!(!session.id.is_empty(), "ID should be generated");
        assert!(
            session.container_id.is_none(),
            "Container ID should be empty initially"
        );

        db.close().await;
    }

    #[tokio::test]
    async fn test_list_sessions() {
        let db = setup_test_db().await;

        use crate::models::NewSession;

        // Create projects
        let project1 = create_test_project(&db, "/tmp/repo-1").await;
        let project2 = create_test_project(&db, "/tmp/repo-2").await;
        let project3 = create_test_project(&db, "/tmp/repo-3").await;

        // Create multiple sessions
        let projects = vec![project1, project2, project3];
        for (i, project) in projects.iter().enumerate() {
            let new_session = NewSession {
                project_id: project.id.clone(),
                name: format!("Session {}", i + 1),
                base_branch: "main".to_string(),
                initial_message: None,
            };
            db.create_session(new_session).await.unwrap();
        }

        let sessions = db.list_sessions().await.unwrap();
        assert_eq!(sessions.len(), 3, "Should return 3 sessions");

        db.close().await;
    }

    #[tokio::test]
    async fn test_get_session_by_id() {
        let db = setup_test_db().await;

        use crate::models::NewSession;

        let project = create_test_project(&db, "/tmp/findme").await;

        let new_session = NewSession {
            project_id: project.id,
            name: "Find Me".to_string(),
            base_branch: "main".to_string(),
            initial_message: None,
        };

        let created = db.create_session(new_session).await.unwrap();
        let found = db.get_session(&created.id).await.unwrap();

        assert_eq!(found.id, created.id);
        assert_eq!(found.name, "Find Me");

        db.close().await;
    }

    #[tokio::test]
    async fn test_get_session_not_found() {
        let db = setup_test_db().await;

        let result = db.get_session("nonexistent-id").await;
        assert!(
            result.is_err(),
            "Should return error for nonexistent session"
        );

        db.close().await;
    }

    #[tokio::test]
    async fn test_update_session_status() {
        let db = setup_test_db().await;

        use crate::models::NewSession;

        let project = create_test_project(&db, "/tmp/status").await;

        let new_session = NewSession {
            project_id: project.id,
            name: "Status Test".to_string(),
            base_branch: "main".to_string(),
            initial_message: None,
        };

        let session = db.create_session(new_session).await.unwrap();
        assert_eq!(session.status, "created");

        db.update_session_status(&session.id, "ready")
            .await
            .unwrap();

        let updated = db.get_session(&session.id).await.unwrap();
        assert_eq!(updated.status, "ready");

        db.close().await;
    }

    #[tokio::test]
    async fn test_update_session_container_info() {
        let db = setup_test_db().await;

        use crate::models::NewSession;

        let project = create_test_project(&db, "/tmp/container").await;

        let new_session = NewSession {
            project_id: project.id,
            name: "Container Test".to_string(),
            base_branch: "main".to_string(),
            initial_message: None,
        };

        let session = db.create_session(new_session).await.unwrap();
        assert!(session.container_id.is_none());

        db.update_session_container(
            &session.id,
            "container-123",
            "opslane-session-abc",
            "session/feat-abc",
        )
        .await
        .unwrap();

        let updated = db.get_session(&session.id).await.unwrap();
        assert_eq!(updated.container_id, Some("container-123".to_string()));
        assert_eq!(
            updated.container_name,
            Some("opslane-session-abc".to_string())
        );
        assert_eq!(
            updated.container_branch,
            Some("session/feat-abc".to_string())
        );

        db.close().await;
    }

    #[tokio::test]
    async fn test_delete_session_soft() {
        let db = setup_test_db().await;

        use crate::models::NewSession;

        let project = create_test_project(&db, "/tmp/delete").await;

        let new_session = NewSession {
            project_id: project.id,
            name: "Delete Me".to_string(),
            base_branch: "main".to_string(),
            initial_message: None,
        };

        let session = db.create_session(new_session).await.unwrap();
        let session_id = session.id.clone();

        db.delete_session(&session_id).await.unwrap();

        // Session should not be retrievable via get_session (soft delete filters it out)
        let result = db.get_session(&session_id).await;
        assert!(result.is_err(), "Deleted session should not be retrievable");

        // Should not appear in list
        let sessions = db.list_sessions().await.unwrap();
        assert_eq!(
            sessions.len(),
            0,
            "Deleted session should not appear in list"
        );

        db.close().await;
    }

    #[tokio::test]
    async fn test_list_sessions_excludes_deleted() {
        let db = setup_test_db().await;

        use crate::models::NewSession;

        // Create projects and sessions
        let mut session_ids = vec![];
        for i in 1..=3 {
            let project = create_test_project(&db, &format!("/tmp/repo-{i}")).await;
            let new_session = NewSession {
                project_id: project.id,
                name: format!("Session {i}"),
                base_branch: "main".to_string(),
                initial_message: None,
            };
            let session = db.create_session(new_session).await.unwrap();
            session_ids.push(session.id);
        }

        // Delete the second session
        db.delete_session(&session_ids[1]).await.unwrap();

        // List should only return 2
        let sessions = db.list_sessions().await.unwrap();
        assert_eq!(sessions.len(), 2, "Should only return non-deleted sessions");

        db.close().await;
    }

    // Phase 4: Session Persistence Tests

    #[tokio::test]
    async fn test_update_session_volume() {
        let db = setup_test_db().await;

        use crate::models::NewSession;

        let project = create_test_project(&db, "/tmp/volume-test").await;

        let new_session = NewSession {
            project_id: project.id,
            name: "Volume Test".to_string(),
            base_branch: "main".to_string(),
            initial_message: None,
        };

        let session = db.create_session(new_session).await.unwrap();
        assert!(session.volume_name.is_none());

        // Update volume name
        db.update_session_volume(&session.id, "opslane-session-test")
            .await
            .unwrap();

        let updated = db.get_session(&session.id).await.unwrap();
        assert_eq!(
            updated.volume_name,
            Some("opslane-session-test".to_string())
        );

        db.close().await;
    }

    #[tokio::test]
    async fn test_update_claude_session_id() {
        let db = setup_test_db().await;

        use crate::models::NewSession;

        let project = create_test_project(&db, "/tmp/claude-test").await;

        let new_session = NewSession {
            project_id: project.id,
            name: "Claude ID Test".to_string(),
            base_branch: "main".to_string(),
            initial_message: None,
        };

        let session = db.create_session(new_session).await.unwrap();
        assert!(session.claude_session_id.is_none());

        // Update Claude session ID
        db.update_claude_session_id(&session.id, "claude-session-abc123")
            .await
            .unwrap();

        let updated = db.get_session(&session.id).await.unwrap();
        assert_eq!(
            updated.claude_session_id,
            Some("claude-session-abc123".to_string())
        );

        db.close().await;
    }

    #[tokio::test]
    async fn test_session_with_all_persistence_fields() {
        let db = setup_test_db().await;

        use crate::models::NewSession;

        let project = create_test_project(&db, "/tmp/full-test").await;

        let new_session = NewSession {
            project_id: project.id,
            name: "Full Persistence Test".to_string(),
            base_branch: "main".to_string(),
            initial_message: None,
        };

        let session = db.create_session(new_session).await.unwrap();

        // Set all persistence fields
        db.update_session_volume(&session.id, "opslane-session-abc12345")
            .await
            .unwrap();
        db.update_claude_session_id(&session.id, "claude-xyz789")
            .await
            .unwrap();

        // Update status to 'ready'
        db.update_session_status(&session.id, "ready")
            .await
            .unwrap();

        // Update activity timestamp separately
        db.update_session_activity(&session.id).await.unwrap();

        // Verify all fields present
        let updated = db.get_session(&session.id).await.unwrap();
        assert_eq!(
            updated.volume_name,
            Some("opslane-session-abc12345".to_string())
        );
        assert_eq!(updated.claude_session_id, Some("claude-xyz789".to_string()));
        assert!(
            updated.last_activity_at.is_some(),
            "last_activity_at should be set after update_session_activity"
        );

        db.close().await;
    }
}
