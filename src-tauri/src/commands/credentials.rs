use std::path::PathBuf;
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
pub fn get_claude_credentials() -> Result<String, String> {
    let credentials_json = read_claude_credentials_from_keychain()?;
    log::info!("Successfully read Claude credentials from Keychain (content redacted)");
    Ok(credentials_json)
}

/// Refresh Claude credentials from keychain to shared file
///
/// Reads current credentials from macOS Keychain and writes them to
/// ~/.claude/.credentials.json, which is bind-mounted into all containers.
/// This makes updated credentials immediately available to all running sessions.
///
/// # Security
/// - Sets file permissions to 600 (owner read/write only)
/// - Never logs credential content
/// - Non-fatal errors (returns error but doesn't crash app)
#[command]
pub fn refresh_claude_credentials() -> Result<String, String> {
    log::info!("Refreshing Claude credentials from keychain");

    // 1. Read credentials from keychain (reuse existing logic)
    let credentials_json = read_claude_credentials_from_keychain()
        .map_err(|e| format!("Failed to read credentials from keychain: {e}"))?;

    // 2. Determine path to shared credentials file
    let home_dir = std::env::var("HOME")
        .or_else(|_| std::env::var("USERPROFILE")) // Windows fallback
        .map_err(|_| "Could not determine home directory (HOME or USERPROFILE)".to_string())?;

    let mut claude_dir = PathBuf::from(&home_dir);
    claude_dir.push(".claude");

    let mut credentials_path = claude_dir.clone();
    credentials_path.push(".credentials.json");

    // 3. Ensure .claude directory exists
    std::fs::create_dir_all(&claude_dir)
        .map_err(|e| format!("Failed to create .claude directory: {e}"))?;

    // 4. Write credentials to file
    std::fs::write(&credentials_path, &credentials_json)
        .map_err(|e| format!("Failed to write credentials file: {e}"))?;

    // 5. Set file permissions to 600 (owner read/write only) on Unix
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let permissions = std::fs::Permissions::from_mode(0o600);
        std::fs::set_permissions(&credentials_path, permissions)
            .map_err(|e| format!("Failed to set credentials file permissions: {e}"))?;
    }

    log::info!(
        "Successfully refreshed credentials to {} (content redacted)",
        credentials_path.display()
    );

    Ok("Credentials refreshed successfully".to_string())
}

/// Helper function to read Claude credentials from macOS Keychain
/// Extracted for reuse by both get_claude_credentials() and refresh_claude_credentials()
fn read_claude_credentials_from_keychain() -> Result<String, String> {
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

    Ok(credentials_json)
}
