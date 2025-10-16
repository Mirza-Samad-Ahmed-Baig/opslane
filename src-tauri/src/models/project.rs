use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use thiserror::Error;

#[derive(Error, Debug)]
#[allow(dead_code)]
pub enum ProjectValidationError {
    #[error("Project name cannot be empty")]
    EmptyName,

    #[error("Project name cannot exceed 100 characters")]
    NameTooLong,

    #[error("Session ID cannot be empty")]
    EmptySessionId,
}

/// Project model - represents a project within a session
#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct Project {
    pub id: String,
    pub session_id: String,
    pub name: String,
    pub description: Option<String>,
    pub order_index: i32,
    pub created_at: String,
    pub updated_at: String,
    pub is_deleted: bool,
}

/// NewProject - input for creating a project
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NewProject {
    pub session_id: String,
    pub name: String,
    pub description: Option<String>,
}

impl NewProject {
    /// Validate new project input
    #[allow(dead_code)]
    pub fn validate(&self) -> Result<(), ProjectValidationError> {
        if self.name.trim().is_empty() {
            return Err(ProjectValidationError::EmptyName);
        }

        if self.name.len() > 100 {
            return Err(ProjectValidationError::NameTooLong);
        }

        if self.session_id.trim().is_empty() {
            return Err(ProjectValidationError::EmptySessionId);
        }

        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_new_project_validation() {
        let new_project = NewProject {
            session_id: "test-session-id".to_string(),
            name: "Test Project".to_string(),
            description: Some("A test project".to_string()),
        };

        assert!(new_project.validate().is_ok());
    }

    #[test]
    fn test_new_project_empty_name_fails() {
        let new_project = NewProject {
            session_id: "test-session-id".to_string(),
            name: "".to_string(),
            description: None,
        };

        assert!(new_project.validate().is_err());
    }

    #[test]
    fn test_new_project_long_name_fails() {
        let new_project = NewProject {
            session_id: "test-session-id".to_string(),
            name: "a".repeat(101),
            description: None,
        };

        assert!(new_project.validate().is_err());
    }

    #[test]
    fn test_new_project_empty_session_id_fails() {
        let new_project = NewProject {
            session_id: "".to_string(),
            name: "Test Project".to_string(),
            description: None,
        };

        assert!(new_project.validate().is_err());
    }
}
