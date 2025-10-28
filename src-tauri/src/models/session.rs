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

    #[error("Base branch cannot be empty")]
    EmptyBaseBranch,
}

/// Session model - represents a Claude Code session stored in the database
#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct Session {
    pub id: String,
    pub project_id: String, // Foreign key to projects
    pub name: String,
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

    // Sync tracking
    pub last_sync_at: Option<String>, // ISO 8601 timestamp
    pub sync_status: Option<String>,  // "idle" | "syncing" | "synced" | "error"

    // Two-way sync tracking (only one session active at a time)
    pub is_sync_active: bool, // Is two-way sync enabled for this session?
    pub sync_activated_at: Option<String>, // When was sync enabled?
    pub sync_deactivated_at: Option<String>, // When was sync last disabled?

    // Archiving fields
    pub is_archived: bool,           // Whether session is archived
    pub archived_at: Option<String>, // ISO 8601 timestamp when archived
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
    pub project_id: String, // Foreign key to projects
    pub name: String,
    pub base_branch: String,
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
            project_id: "test-project-id".to_string(),
            name: "Test Session".to_string(),
            base_branch: "main".to_string(),
        };

        assert!(new_session.validate().is_ok());
    }

    #[test]
    fn test_new_session_empty_name_fails() {
        let new_session = NewSession {
            project_id: "test-project-id".to_string(),
            name: "".to_string(),
            base_branch: "main".to_string(),
        };

        assert!(new_session.validate().is_err());
    }

    #[test]
    fn test_new_session_long_name_fails() {
        let new_session = NewSession {
            project_id: "test-project-id".to_string(),
            name: "a".repeat(101),
            base_branch: "main".to_string(),
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
