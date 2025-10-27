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
                "-uall".to_string(),
            ],
            Some("/workspace/repo".to_string()),
            None,
            false,
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

        // Generate diff based on file status
        let diff = match status {
            "added" => {
                // For added files, show entire content as additions
                let git_diff_result = state
                    .docker
                    .exec_command_blocking(
                        &container_id,
                        vec![
                            "git".to_string(),
                            "diff".to_string(),
                            "--no-index".to_string(),
                            "/dev/null".to_string(),
                            path.to_string(),
                        ],
                        Some("/workspace/repo".to_string()),
                        None,
                        false,
                    )
                    .await;

                match git_diff_result {
                    Ok(diff) => diff,
                    Err(_) => {
                        // Fallback: cat the file and format as additions
                        state
                            .docker
                            .exec_command_blocking(
                                &container_id,
                                vec!["cat".to_string(), path.to_string()],
                                Some("/workspace/repo".to_string()),
                                None,
                                false,
                            )
                            .await
                            .map(|content| {
                                format!(
                                    "--- /dev/null\n+++ b/{}\n{}",
                                    path,
                                    content
                                        .lines()
                                        .map(|line| format!("+{line}"))
                                        .collect::<Vec<_>>()
                                        .join("\n")
                                )
                            })
                            .unwrap_or_default()
                    }
                }
            }
            "deleted" => {
                // For deleted files, show previous content as deletions
                state
                    .docker
                    .exec_command_blocking(
                        &container_id,
                        vec![
                            "git".to_string(),
                            "show".to_string(),
                            format!("HEAD:{}", path),
                        ],
                        Some("/workspace/repo".to_string()),
                        None,
                        false,
                    )
                    .await
                    .map(|content| {
                        format!(
                            "--- a/{}\n+++ /dev/null\n{}",
                            path,
                            content
                                .lines()
                                .map(|line| format!("-{line}"))
                                .collect::<Vec<_>>()
                                .join("\n")
                        )
                    })
                    .unwrap_or_default()
            }
            _ => {
                // For modified files, get unified diff
                state
                    .docker
                    .exec_command_blocking(
                        &container_id,
                        vec![
                            "git".to_string(),
                            "diff".to_string(),
                            "HEAD".to_string(),
                            "--".to_string(),
                            path.to_string(),
                        ],
                        Some("/workspace/repo".to_string()),
                        None,
                        false,
                    )
                    .await
                    .unwrap_or_default()
            }
        };

        // Check if file is binary
        let is_binary = diff.contains("Binary files") || diff.is_empty() && status == "modified";

        // Limit diff size to prevent memory issues (max 1MB or 10000 lines)
        const MAX_DIFF_SIZE: usize = 1_000_000; // 1MB
        const MAX_DIFF_LINES: usize = 10_000;

        let diff = if is_binary {
            format!("Binary file {path} changed")
        } else if diff.len() > MAX_DIFF_SIZE {
            format!(
                "Diff too large to display ({:.1} MB). File: {}",
                diff.len() as f64 / 1_000_000.0,
                path
            )
        } else {
            let line_count = diff.lines().count();
            if line_count > MAX_DIFF_LINES {
                format!("Diff too large to display ({line_count} lines). File: {path}")
            } else {
                diff
            }
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
