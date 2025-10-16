use tauri::command;

/// Get Claude credentials from macOS Keychain
///
/// Reads OAuth credentials stored by Claude CLI at service "Claude Code-credentials"
/// Returns JSON string with claudeAiOauth structure
///
/// # Security
/// - Uses macOS `security` command which requires user permission
/// - Never logs credential content
/// - Returns error if credentials not found or keychain access denied
#[command]
pub async fn get_claude_credentials() -> Result<String, String> {
    use std::process::Command;

    log::debug!("Reading Claude credentials from macOS Keychain");

    // Get current username for keychain lookup
    let username = std::env::var("USER").map_err(|_| "Could not determine username".to_string())?;

    // Execute macOS security command to read keychain entry
    // -s: service name
    // -a: account name
    // -w: output password only (without labels)
    let output = Command::new("security")
        .args([
            "find-generic-password",
            "-s",
            "Claude Code-credentials",
            "-a",
            &username,
            "-w",
        ])
        .output()
        .map_err(|e| format!("Failed to execute security command: {e}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        if stderr.contains("could not be found") {
            return Err(
                "Claude credentials not found in Keychain. Please log in to Claude CLI first."
                    .to_string(),
            );
        }
        log::error!("Keychain access failed: {stderr}");
        return Err("Failed to read Claude credentials from Keychain".to_string());
    }

    let credentials_json = String::from_utf8_lossy(&output.stdout).trim().to_string();

    if credentials_json.is_empty() {
        return Err("Credentials are empty in Keychain".to_string());
    }

    // Validate it's valid JSON (don't parse structure, just check format)
    serde_json::from_str::<serde_json::Value>(&credentials_json)
        .map_err(|e| format!("Invalid credentials format in Keychain: {e}"))?;

    log::info!("Successfully read Claude credentials from Keychain (content redacted)");

    Ok(credentials_json)
}
