pub mod docker_service;
pub mod session_manager;
pub mod claude_service;

// Future services:
// - git_service.rs (Phase 1.3)

pub use docker_service::DockerService;
pub use session_manager::SessionManager;
pub use claude_service::ClaudeService;
