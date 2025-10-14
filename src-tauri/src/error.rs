use thiserror::Error;

/// Application error types - minimal set for Phase 0
#[derive(Error, Debug)]
pub enum AppError {
    #[error("Database error: {0}")]
    Database(#[from] sqlx::Error),

    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),

    #[error("Configuration error: {0}")]
    Config(String),

    #[error("Unknown error: {0}")]
    Unknown(String),
}

impl AppError {
    /// Get user-friendly error message
    pub fn user_message(&self) -> String {
        match self {
            Self::Database(e) => format!("Database error: {e}"),
            Self::Io(e) => format!("File system error: {e}"),
            Self::Config(msg) => format!("Configuration error: {msg}"),
            Self::Unknown(msg) => format!("An error occurred: {msg}"),
        }
    }
}

/// Convert AppError to String for Tauri commands
impl From<AppError> for String {
    fn from(error: AppError) -> Self {
        error.user_message()
    }
}

/// Convenient Result type alias
#[allow(dead_code)]
pub type AppResult<T> = Result<T, AppError>;
