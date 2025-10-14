use crate::database::Database;
use std::sync::Arc;

/// Global application state - minimal for Phase 0
pub struct AppState {
    /// Database connection pool
    pub db: Arc<Database>,
}

impl AppState {
    /// Initialize application state
    pub async fn init() -> Result<Self, String> {
        log::info!("Initializing application state");

        let db = Database::init()
            .await
            .map_err(|e| format!("Failed to initialize database: {e}"))?;

        log::info!("Application state initialized successfully");

        Ok(Self { db: Arc::new(db) })
    }
}
