use anyhow::Result;
use sqlx::migrate::MigrateDatabase;
use sqlx::sqlite::{SqlitePool, SqlitePoolOptions};
use std::path::PathBuf;

/// Database service - minimal implementation for Phase 0
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
                id, name, local_repo_path, base_branch, status, is_deleted
            ) VALUES (?, ?, ?, ?, 'created', 0)
            RETURNING
                id, name, local_repo_path, base_branch,
                container_id, container_name, container_branch,
                status, error_message,
                volume_name, claude_session_id, last_activity_at,
                created_at, updated_at, is_deleted
            "#,
        )
        .bind(&id)
        .bind(&new.name)
        .bind(&new.local_repo_path)
        .bind(&new.base_branch)
        .fetch_one(&self.pool)
        .await?;

        Ok(session)
    }

    /// List all non-deleted sessions
    #[allow(dead_code)]
    pub async fn list_sessions(&self) -> Result<Vec<crate::models::Session>> {
        let sessions = sqlx::query_as::<_, crate::models::Session>(
            r#"
            SELECT
                id, name, local_repo_path, base_branch,
                container_id, container_name, container_branch,
                status, error_message,
                volume_name, claude_session_id, last_activity_at,
                created_at, updated_at, is_deleted
            FROM sessions
            WHERE is_deleted = 0
            ORDER BY created_at DESC
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
            SELECT
                id, name, local_repo_path, base_branch,
                container_id, container_name, container_branch,
                status, error_message,
                volume_name, claude_session_id, last_activity_at,
                created_at, updated_at, is_deleted
            FROM sessions
            WHERE id = ?
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

    #[tokio::test]
    async fn test_database_init() {
        let db = setup_test_db().await;

        // Test basic query
        let result: (i32,) = sqlx::query_as("SELECT 1")
            .fetch_one(db.pool())
            .await
            .unwrap();

        assert_eq!(result.0, 1);

        // Verify migration ran successfully
        let message: String =
            sqlx::query_scalar("SELECT message FROM _migration_test WHERE id = 1")
                .fetch_one(db.pool())
                .await
                .unwrap();

        assert_eq!(message, "Migrations working!");

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
            "name",
            "local_repo_path",
            "base_branch",
            "container_id",
            "container_name",
            "container_branch",
            "status",
            "error_message",
            "created_at",
            "updated_at",
            "is_deleted",
            "volume_name",
            "claude_session_id",
            "last_activity_at",
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

        let new_session = NewSession {
            name: "Test Session".to_string(),
            local_repo_path: "/tmp/test-repo".to_string(),
            base_branch: "main".to_string(),
        };

        let session = db.create_session(new_session).await.unwrap();

        assert_eq!(session.name, "Test Session");
        assert_eq!(session.local_repo_path, "/tmp/test-repo");
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

        // Create multiple sessions
        for i in 1..=3 {
            let new_session = NewSession {
                name: format!("Session {i}"),
                local_repo_path: format!("/tmp/repo-{i}"),
                base_branch: "main".to_string(),
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

        let new_session = NewSession {
            name: "Find Me".to_string(),
            local_repo_path: "/tmp/findme".to_string(),
            base_branch: "main".to_string(),
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

        let new_session = NewSession {
            name: "Status Test".to_string(),
            local_repo_path: "/tmp/status".to_string(),
            base_branch: "main".to_string(),
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

        let new_session = NewSession {
            name: "Container Test".to_string(),
            local_repo_path: "/tmp/container".to_string(),
            base_branch: "main".to_string(),
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

        let new_session = NewSession {
            name: "Delete Me".to_string(),
            local_repo_path: "/tmp/delete".to_string(),
            base_branch: "main".to_string(),
        };

        let session = db.create_session(new_session).await.unwrap();

        db.delete_session(&session.id).await.unwrap();

        // Session should still exist in DB but marked deleted
        let deleted = db.get_session(&session.id).await.unwrap();
        assert!(deleted.is_deleted);

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

        // Create 3 sessions
        let mut session_ids = vec![];
        for i in 1..=3 {
            let new_session = NewSession {
                name: format!("Session {i}"),
                local_repo_path: format!("/tmp/repo-{i}"),
                base_branch: "main".to_string(),
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
}
