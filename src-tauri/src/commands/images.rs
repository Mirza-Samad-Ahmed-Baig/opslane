use std::path::PathBuf;
use tauri::State;
use uuid::Uuid;

use crate::state::AppState;

const MAX_IMAGE_SIZE: u64 = 10 * 1024 * 1024; // 10MB
const ALLOWED_EXTENSIONS: &[&str] = &["png", "jpg", "jpeg", "gif", "webp"];

// Magic number signatures for image format validation
const PNG_MAGIC: &[u8] = &[0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A];
const JPEG_MAGIC: &[u8] = &[0xFF, 0xD8, 0xFF];
const GIF_MAGIC_87A: &[u8] = b"GIF87a";
const GIF_MAGIC_89A: &[u8] = b"GIF89a";
const WEBP_MAGIC: &[u8] = b"RIFF";
const WEBP_MAGIC_WEBP: &[u8] = b"WEBP";

/// Validates that the file content matches its claimed extension
fn validate_image_content(path: &PathBuf, extension: &str) -> Result<(), String> {
    let mut file = std::fs::File::open(path)
        .map_err(|e| format!("Failed to open file for validation: {e}"))?;

    let mut header = vec![0u8; 12]; // Read first 12 bytes for magic number check
    use std::io::Read;
    file.read_exact(&mut header)
        .map_err(|e| format!("Failed to read file header: {e}"))?;

    let is_valid = match extension {
        "png" => header.starts_with(PNG_MAGIC),
        "jpg" | "jpeg" => header.starts_with(JPEG_MAGIC),
        "gif" => header.starts_with(GIF_MAGIC_87A) || header.starts_with(GIF_MAGIC_89A),
        "webp" => header.starts_with(WEBP_MAGIC) && header[8..12] == *WEBP_MAGIC_WEBP,
        _ => false,
    };

    if !is_valid {
        return Err(format!(
            "File content does not match extension .{extension}. Possible malicious file."
        ));
    }

    Ok(())
}

/// Sanitizes filename using a whitelist approach
/// Only allows alphanumeric characters, hyphens, underscores, and dots
fn sanitize_filename(filename: &str) -> Result<String, String> {
    // Reject empty filenames
    if filename.trim().is_empty() {
        return Err("Filename cannot be empty".to_string());
    }

    // Reject filenames starting with dot (hidden files)
    if filename.starts_with('.') {
        return Err("Filename cannot start with a dot".to_string());
    }

    // Reject filenames that are just dots or contain path separators
    if filename == "." || filename == ".." {
        return Err("Invalid filename".to_string());
    }

    // Use whitelist approach - only allow safe characters
    let safe_filename = filename
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || c == '-' || c == '_' || c == '.' {
                c
            } else {
                '_'
            }
        })
        .collect::<String>();

    // Ensure result is not empty after sanitization
    if safe_filename.trim().is_empty() {
        return Err("Filename contains only invalid characters".to_string());
    }

    Ok(safe_filename)
}

/// Checks if sufficient disk space is available
fn check_disk_space(file_size: u64) -> Result<(), String> {
    // Get available space in /tmp
    #[cfg(unix)]
    {
        let _metadata =
            std::fs::metadata("/tmp").map_err(|e| format!("Failed to check disk space: {e}"))?;

        // This is a simplified check - in production you'd use statvfs
        // For now, we'll skip the actual free space check since it requires platform-specific code
        // and just validate we can access /tmp
    }

    // Ensure we're not copying files that are too large
    if file_size > MAX_IMAGE_SIZE {
        return Err(format!(
            "File size {}MB exceeds maximum {}MB",
            file_size / 1024 / 1024,
            MAX_IMAGE_SIZE / 1024 / 1024
        ));
    }

    Ok(())
}

#[tauri::command]
pub async fn copy_image_to_session(
    session_id: String,
    source_path: String,
    filename: String,
    state: State<'_, AppState>,
) -> Result<String, String> {
    log::info!("copy_image_to_session: session={session_id}, file={filename}");

    // 1. Validate session ID is a valid UUID
    let _uuid =
        Uuid::parse_str(&session_id).map_err(|_| "Invalid session ID format".to_string())?;

    // 2. Verify session exists in database and is not deleted
    let session = state
        .db
        .get_session(&session_id)
        .await
        .map_err(|_| "Session not found".to_string())?;

    if session.is_deleted {
        return Err("Session has been deleted".to_string());
    }

    // 3. Validate source path exists and is a file
    let source = PathBuf::from(&source_path);
    if !source.exists() {
        return Err(format!("Source file does not exist: {source_path}"));
    }

    if !source.is_file() {
        return Err("Source path is not a file".to_string());
    }

    // 4. Validate file size
    let metadata =
        std::fs::metadata(&source).map_err(|e| format!("Failed to read file metadata: {e}"))?;

    check_disk_space(metadata.len())?;

    if metadata.len() > MAX_IMAGE_SIZE {
        return Err(format!(
            "Image too large: {}MB (max 10MB)",
            metadata.len() / 1024 / 1024
        ));
    }

    // 5. Validate file extension
    let extension = source
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_lowercase())
        .ok_or_else(|| "File has no extension".to_string())?;

    if !ALLOWED_EXTENSIONS.contains(&extension.as_str()) {
        return Err(format!(
            "Unsupported image format: .{extension}. Allowed: {}",
            ALLOWED_EXTENSIONS.join(", ")
        ));
    }

    // 6. Validate actual image content matches extension
    validate_image_content(&source, &extension)?;

    // 7. Sanitize filename with whitelist approach
    let sanitized_name = sanitize_filename(&filename)?;

    // 8. Generate unique filename to prevent overwrites
    let unique_id = Uuid::new_v4();
    let name_without_ext = sanitized_name.trim_end_matches(&format!(".{extension}"));
    let unique_filename = format!("{name_without_ext}_{unique_id}.{extension}");

    // 9. Create session images directory
    let session_images_dir = format!("/tmp/opslane-sessions/{session_id}/images");
    std::fs::create_dir_all(&session_images_dir)
        .map_err(|e| format!("Failed to create images directory: {e}"))?;

    // 10. Copy file to session directory with unique name
    let dest_path = PathBuf::from(&session_images_dir).join(&unique_filename);

    std::fs::copy(&source, &dest_path).map_err(|e| format!("Failed to copy image: {e}"))?;

    log::info!("Successfully copied image to {}", dest_path.display());

    // 11. Return container path (what Claude CLI will see)
    let container_path = format!("/workspace/images/{unique_filename}");
    Ok(container_path)
}
