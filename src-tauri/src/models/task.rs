use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use thiserror::Error;

#[derive(Error, Debug)]
#[allow(dead_code)]
pub enum TaskValidationError {
    #[error("Task name cannot be empty")]
    EmptyName,

    #[error("Task name cannot exceed 200 characters")]
    NameTooLong,

    #[error("Project ID cannot be empty")]
    EmptyProjectId,

    #[error("Invalid task status: {0}")]
    InvalidStatus(String),
}

/// Task model - represents a task within a project
#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct Task {
    pub id: String,
    pub project_id: String,
    pub name: String,
    pub status: String,
    pub order_index: i32,
    pub created_at: String,
    pub updated_at: String,
    pub completed_at: Option<String>,
    pub is_deleted: bool,
}

impl Task {
    /// Validate task status
    #[allow(dead_code)]
    pub fn is_valid_status(status: &str) -> bool {
        matches!(status, "pending" | "in_progress" | "completed")
    }
}

/// NewTask - input for creating a task
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NewTask {
    pub project_id: String,
    pub name: String,
}

impl NewTask {
    /// Validate new task input
    #[allow(dead_code)]
    pub fn validate(&self) -> Result<(), TaskValidationError> {
        if self.name.trim().is_empty() {
            return Err(TaskValidationError::EmptyName);
        }

        if self.name.len() > 200 {
            return Err(TaskValidationError::NameTooLong);
        }

        if self.project_id.trim().is_empty() {
            return Err(TaskValidationError::EmptyProjectId);
        }

        Ok(())
    }
}

/// UpdateTaskStatus - input for updating task status
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateTaskStatus {
    pub status: String,
}

impl UpdateTaskStatus {
    /// Validate status update
    #[allow(dead_code)]
    pub fn validate(&self) -> Result<(), TaskValidationError> {
        if !Task::is_valid_status(&self.status) {
            return Err(TaskValidationError::InvalidStatus(self.status.clone()));
        }

        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_new_task_validation() {
        let new_task = NewTask {
            project_id: "test-project-id".to_string(),
            name: "Test Task".to_string(),
        };

        assert!(new_task.validate().is_ok());
    }

    #[test]
    fn test_new_task_empty_name_fails() {
        let new_task = NewTask {
            project_id: "test-project-id".to_string(),
            name: "".to_string(),
        };

        assert!(new_task.validate().is_err());
    }

    #[test]
    fn test_new_task_long_name_fails() {
        let new_task = NewTask {
            project_id: "test-project-id".to_string(),
            name: "a".repeat(201),
        };

        assert!(new_task.validate().is_err());
    }

    #[test]
    fn test_new_task_empty_project_id_fails() {
        let new_task = NewTask {
            project_id: "".to_string(),
            name: "Test Task".to_string(),
        };

        assert!(new_task.validate().is_err());
    }

    #[test]
    fn test_task_status_validation() {
        let valid_statuses = vec!["pending", "in_progress", "completed"];
        for status in valid_statuses {
            assert!(Task::is_valid_status(status));
        }

        assert!(!Task::is_valid_status("invalid_status"));
    }

    #[test]
    fn test_update_task_status_validation() {
        let valid_update = UpdateTaskStatus {
            status: "in_progress".to_string(),
        };
        assert!(valid_update.validate().is_ok());

        let invalid_update = UpdateTaskStatus {
            status: "invalid_status".to_string(),
        };
        assert!(invalid_update.validate().is_err());
    }
}
