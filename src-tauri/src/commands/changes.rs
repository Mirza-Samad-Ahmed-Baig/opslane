use crate::state::AppState;
use serde::{Deserialize, Serialize};
use tauri::State;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileChange {
    pub path: String,
    pub status: String, // "added", "modified", "deleted"
    pub additions: usize,
    pub deletions: usize,
    pub diff: String,
}

/// Get file changes for a session's container
#[tauri::command]
pub async fn get_session_changes(
    session_id: String,
    state: State<'_, AppState>,
) -> Result<Vec<FileChange>, String> {
    // Get the session from database
    let session = state
        .db
        .get_session(&session_id)
        .await
        .map_err(|e| format!("Session not found: {e}"))?;

    // Check if container exists
    let container_id = session.container_id.ok_or("Container not created yet")?;

    // Get git status (short format)
    let status_output = state
        .docker
        .exec_command_blocking(
            &container_id,
            vec![
                "git".to_string(),
                "status".to_string(),
                "--porcelain".to_string(),
            ],
            Some("/workspace/repo".to_string()),
        )
        .await
        .map_err(|e| format!("Failed to get git status: {e}"))?;

    let mut changes = Vec::new();

    // Parse git status output
    for line in status_output.lines() {
        if line.len() < 3 {
            continue;
        }

        let status_code = line[0..2].trim();
        let path = line[3..].trim();

        // Validate path to prevent command injection
        // Reject paths with suspicious characters that could be used for injection
        if path.contains('\0') || path.contains('\n') || path.starts_with('-') {
            log::warn!("Skipping suspicious file path: {path}");
            continue;
        }

        let status = match status_code {
            "A" | "??" => "added",
            "M" => "modified",
            "D" => "deleted",
            _ => "modified",
        };

        // Get diff for this file (skip untracked files for diff)
        let diff = if status != "added" {
            state
                .docker
                .exec_command_blocking(
                    &container_id,
                    vec![
                        "git".to_string(),
                        "diff".to_string(),
                        "HEAD".to_string(),
                        "--".to_string(), // Use -- to separate filenames from options
                        path.to_string(),
                    ],
                    Some("/workspace/repo".to_string()),
                )
                .await
                .unwrap_or_default()
        } else {
            // For new files, show the content as added
            format!("+++ {path}\n")
        };

        // Count additions/deletions from diff
        let mut additions = 0;
        let mut deletions = 0;
        for diff_line in diff.lines() {
            if diff_line.starts_with('+') && !diff_line.starts_with("+++") {
                additions += 1;
            } else if diff_line.starts_with('-') && !diff_line.starts_with("---") {
                deletions += 1;
            }
        }

        changes.push(FileChange {
            path: path.to_string(),
            status: status.to_string(),
            additions,
            deletions,
            diff,
        });
    }

    Ok(changes)
}
