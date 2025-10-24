pub mod claude_service;
pub mod docker_service;
pub mod session_manager;
pub mod sync_manager;
pub mod sync_watcher;

// Future services:
// - git_service.rs (Phase 1.3)

pub use claude_service::ClaudeService;
pub use docker_service::DockerService;
pub use session_manager::SessionManager;
pub use sync_manager::SyncManager;
pub use sync_watcher::SyncWatcher;
