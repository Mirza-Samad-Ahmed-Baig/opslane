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

        // Connect with minimal pool (just 3 connections for now)
        let pool = SqlitePoolOptions::new()
            .max_connections(3)
            .connect(&db_url)
            .await?;

        // Run migrations
        log::info!("Running database migrations");
        sqlx::migrate!("./migrations").run(&pool).await?;

        log::info!(
            "Database initialized successfully at: {}",
            db_path.display()
        );

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
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_database_init() {
        let db = Database::init().await.unwrap();

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
}
