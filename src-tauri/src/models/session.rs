use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use thiserror::Error;

#[derive(Error, Debug)]
#[allow(dead_code)]
pub enum ValidationError {
    #[error("Session name cannot be empty")]
    EmptyName,

    #[error("Session name cannot exceed 100 characters")]
    NameTooLong,

    #[error("Repository path cannot be empty")]
    EmptyRepoPath,

    #[error("Base branch cannot be empty")]
    EmptyBaseBranch,
}

/// Session model - represents a Claude Code session stored in the database
#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct Session {
    pub id: String,
    pub name: String,
    pub local_repo_path: String,           // Original repo (user's repo)
    pub session_repo_path: Option<String>, // Copy location for this session
    pub base_branch: String,
    pub container_id: Option<String>,
    pub container_name: Option<String>,
    pub container_branch: Option<String>,
    pub status: String,
    pub error_message: Option<String>,

    // Session persistence fields
    pub volume_name: Option<String>, // Docker volume for Claude session data
    pub claude_session_id: Option<String>, // Claude's session ID
    pub last_activity_at: Option<String>, // For idle detection

    pub created_at: String,
    pub updated_at: String,
    pub is_deleted: bool,
}

impl Session {
    /// Validate session status
    #[allow(dead_code)]
    pub fn is_valid_status(status: &str) -> bool {
        matches!(status, "created" | "cloning" | "ready" | "error")
    }
}

/// NewSession - input for creating a session
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NewSession {
    pub name: String,
    pub local_repo_path: String,
    pub base_branch: String,
    pub initial_message: Option<String>, // Optional initial message to send to Claude
}

impl NewSession {
    /// Validate new session input
    #[allow(dead_code)]
    pub fn validate(&self) -> Result<(), ValidationError> {
        if self.name.trim().is_empty() {
            return Err(ValidationError::EmptyName);
        }

        if self.name.len() > 100 {
            return Err(ValidationError::NameTooLong);
        }

        if self.local_repo_path.trim().is_empty() {
            return Err(ValidationError::EmptyRepoPath);
        }

        if self.base_branch.trim().is_empty() {
            return Err(ValidationError::EmptyBaseBranch);
        }

        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_new_session_validation() {
        let new_session = NewSession {
            name: "Test Session".to_string(),
            local_repo_path: "/tmp/test".to_string(),
            base_branch: "main".to_string(),
            initial_message: None,
        };

        assert!(new_session.validate().is_ok());
    }

    #[test]
    fn test_new_session_empty_name_fails() {
        let new_session = NewSession {
            name: "".to_string(),
            local_repo_path: "/tmp/test".to_string(),
            base_branch: "main".to_string(),
            initial_message: None,
        };

        assert!(new_session.validate().is_err());
    }

    #[test]
    fn test_new_session_long_name_fails() {
        let new_session = NewSession {
            name: "a".repeat(101),
            local_repo_path: "/tmp/test".to_string(),
            base_branch: "main".to_string(),
            initial_message: None,
        };

        assert!(new_session.validate().is_err());
    }

    #[test]
    fn test_session_status_validation() {
        let valid_statuses = vec!["created", "cloning", "ready", "error"];
        for status in valid_statuses {
            assert!(Session::is_valid_status(status));
        }

        assert!(!Session::is_valid_status("invalid_status"));
    }
}
