pub mod claude_service;
pub mod docker_service;
pub mod session_manager;

// Future services:
// - git_service.rs (Phase 1.3)

pub use claude_service::ClaudeService;
pub use docker_service::DockerService;
pub use session_manager::SessionManager;
