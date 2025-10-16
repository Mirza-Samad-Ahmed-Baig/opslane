use crate::database::Database;
use crate::services::{ClaudeService, DockerService, SessionManager};
use std::sync::Arc;

/// Global application state
pub struct AppState {
    /// Database connection pool
    pub db: Arc<Database>,

    /// Docker service for container management
    #[allow(dead_code)] // Will be used in Tauri commands (Phase 4)
    pub docker: Arc<DockerService>,

    /// Session manager for orchestrating DB + Docker
    #[allow(dead_code)] // Will be used in Tauri commands (Phase 4)
    pub session_manager: Arc<SessionManager>,

    /// Claude service for managing Claude Code interactions
    #[allow(dead_code)] // Will be used in Tauri commands (Phase 4)
    pub claude_service: Arc<ClaudeService>,
}

impl AppState {
    /// Initialize application state
    pub async fn init() -> Result<Self, String> {
        log::info!("Initializing application state");

        // Initialize database
        let db = Database::init()
            .await
            .map_err(|e| format!("Failed to initialize database: {e}"))?;
        let db = Arc::new(db);

        // Initialize Docker service
        let docker = DockerService::new()
            .map_err(|e| format!("Failed to initialize Docker service: {e}"))?;
        let docker = Arc::new(docker);

        // Check Docker availability
        docker
            .check_available()
            .await
            .map_err(|e| format!("Docker daemon not available: {e}"))?;

        // Initialize session manager with default resource limits
        // TODO: Load these from settings table
        let default_cpu_limit = 1.0;
        let default_memory_limit_mb = 2048;

        let session_manager = SessionManager::new(
            Arc::clone(&db),
            Arc::clone(&docker),
            default_cpu_limit,
            default_memory_limit_mb,
        );
        let session_manager = Arc::new(session_manager);

        // Initialize Claude service
        let claude_service = ClaudeService::new(Arc::clone(&docker), Arc::clone(&db));
        let claude_service = Arc::new(claude_service);

        log::info!("Application state initialized successfully");

        Ok(Self {
            db,
            docker,
            session_manager,
            claude_service,
        })
    }
}
