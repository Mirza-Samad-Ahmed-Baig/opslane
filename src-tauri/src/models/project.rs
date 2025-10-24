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

    #[error("Repository path cannot be empty")]
    EmptyRepoPath,
}

/// Project model - represents a source code repository location
#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct Project {
    pub id: String,
    pub name: String,                   // Folder name (e.g., "opslane")
    pub local_repo_path: String,        // Full path (e.g., "/Users/me/opslane")
    pub last_opened_at: Option<String>, // ISO 8601 timestamp
    pub created_at: String,
    pub updated_at: String,
    pub is_deleted: bool,

    // Active sync tracking - only ONE session can be active at a time
    pub active_sync_session_id: Option<String>, // Which session has two-way sync
    pub active_sync_started_at: Option<String>, // When sync was enabled
}

/// NewProject - input for creating a project
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NewProject {
    pub name: String,
    pub local_repo_path: String,
}

impl NewProject {
    /// Validate new project input
    pub fn validate(&self) -> Result<(), ProjectValidationError> {
        if self.name.trim().is_empty() {
            return Err(ProjectValidationError::EmptyName);
        }

        if self.name.len() > 100 {
            return Err(ProjectValidationError::NameTooLong);
        }

        if self.local_repo_path.trim().is_empty() {
            return Err(ProjectValidationError::EmptyRepoPath);
        }

        Ok(())
    }

    /// Extract folder name from path
    pub fn extract_folder_name(path: &str) -> String {
        std::path::Path::new(path)
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("unknown")
            .to_string()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_extract_folder_name() {
        assert_eq!(
            NewProject::extract_folder_name("/Users/me/opslane"),
            "opslane"
        );
        assert_eq!(
            NewProject::extract_folder_name("/home/user/my-project"),
            "my-project"
        );
        // Windows path - only test on Windows
        #[cfg(target_os = "windows")]
        assert_eq!(
            NewProject::extract_folder_name("C:\\Users\\me\\my-app"),
            "my-app"
        );
    }

    #[test]
    fn test_new_project_validation() {
        let new_project = NewProject {
            name: "Test Project".to_string(),
            local_repo_path: "/tmp/test".to_string(),
        };

        assert!(new_project.validate().is_ok());
    }

    #[test]
    fn test_new_project_empty_name_fails() {
        let new_project = NewProject {
            name: "".to_string(),
            local_repo_path: "/tmp/test".to_string(),
        };

        assert!(new_project.validate().is_err());
    }

    #[test]
    fn test_new_project_long_name_fails() {
        let new_project = NewProject {
            name: "a".repeat(101),
            local_repo_path: "/tmp/test".to_string(),
        };

        assert!(new_project.validate().is_err());
    }

    #[test]
    fn test_new_project_empty_repo_path_fails() {
        let new_project = NewProject {
            name: "Test Project".to_string(),
            local_repo_path: "".to_string(),
        };

        assert!(new_project.validate().is_err());
    }
}
