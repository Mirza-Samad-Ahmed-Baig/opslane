use crate::database::Database;
use crate::services::DockerService;
use std::sync::Arc;

/// Global application state
pub struct AppState {
    /// Database connection pool
    pub db: Arc<Database>,

    /// Docker service for container management (Phase 1)
    /// Will be used by SessionManager in Phase 3
    #[allow(dead_code)]
    pub docker: Option<Arc<DockerService>>,
}

impl AppState {
    /// Initialize application state
    pub async fn init() -> Result<Self, String> {
        log::info!("Initializing application state");

        // Initialize database
        let db = Database::init()
            .await
            .map_err(|e| format!("Failed to initialize database: {e}"))?;

        // Initialize Docker service (optional - app can run without it for now)
        let docker = match DockerService::new() {
            Ok(service) => match service.check_available().await {
                Ok(_) => {
                    log::info!("Docker daemon is available");
                    Some(Arc::new(service))
                }
                Err(e) => {
                    log::error!("Docker daemon not responding: {e}");
                    log::error!("Please ensure Docker Desktop is running");
                    log::warn!("Application will start without Docker support");
                    None
                }
            },
            Err(e) => {
                log::error!("Failed to connect to Docker: {e}");
                log::error!("Docker is required for session management");
                log::warn!("Application will start without Docker support");
                None
            }
        };

        log::info!("Application state initialized successfully");

        Ok(Self {
            db: Arc::new(db),
            docker,
        })
    }
}
