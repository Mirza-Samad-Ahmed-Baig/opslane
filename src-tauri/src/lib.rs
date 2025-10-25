mod commands;
pub mod database;
mod error;
pub mod models;
pub mod services;
mod state;

use commands::*;
use state::AppState;
use tauri::{Emitter, Manager};

/// Refresh credentials from keychain on app startup
/// Non-blocking - errors are logged but don't prevent app from starting
/// Delegates to the refresh_claude_credentials command to avoid code duplication
fn refresh_credentials_on_startup() -> Result<(), String> {
    log::info!("Attempting to refresh Claude credentials from keychain");

    // Call the existing command to avoid code duplication
    refresh_claude_credentials().map(|_| ())
}

// Legacy demo commands (keep for now)
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {name}! Welcome to Opslane Desktop.")
}

#[tauri::command]
async fn get_system_info() -> Result<String, String> {
    let os = std::env::consts::OS;
    let arch = std::env::consts::ARCH;
    Ok(format!("OS: {os}\nArchitecture: {arch}"))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Configure logging via Tauri plugin
    use log::LevelFilter;

    #[allow(clippy::if_same_then_else)]
    let log_level = if cfg!(debug_assertions) {
        LevelFilter::Info // Changed from Debug to Info
    } else {
        LevelFilter::Info
    };

    tauri::Builder::default()
        .plugin(
            tauri_plugin_log::Builder::default()
                .level(log_level)
                // Suppress noisy third-party dependencies
                .level_for("bollard", LevelFilter::Warn)
                .level_for("sqlx", LevelFilter::Warn)
                .build(),
        )
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_global_shortcut::Builder::default().build())
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .invoke_handler(tauri::generate_handler![
            // Legacy commands
            greet,
            get_system_info,
            // Health commands
            health_check,
            check_database,
            // Docker commands
            check_docker,
            // Session commands
            create_session,
            get_session,
            list_sessions,
            list_sessions_by_project,
            delete_session,
            get_container_logs,
            // Message commands
            send_message,
            get_messages,
            // Image commands
            copy_image_to_session,
            // Project commands
            get_or_create_project,
            list_projects,
            get_project,
            delete_project,
            // Change tracking commands
            get_session_changes,
            // Sync commands
            sync_session_to_project,
            enable_session_sync,
            disable_all_sync,
            get_sync_status,
            is_session_syncing,
            // Credentials commands
            get_claude_credentials,
            refresh_claude_credentials,
        ])
        .setup(|app| {
            log::info!("Starting Opslane v{}", env!("CARGO_PKG_VERSION"));

            tauri::async_runtime::block_on(async {
                match AppState::init().await {
                    Ok(state) => {
                        app.manage(state);
                        log::info!("Application ready");

                        // Refresh credentials on startup (non-blocking)
                        let app_handle = app.handle().clone();
                        std::thread::spawn(move || {
                            match refresh_credentials_on_startup() {
                                Ok(_) => {
                                    log::info!("Startup credential refresh completed successfully");
                                }
                                Err(e) => {
                                    log::warn!("Failed to refresh credentials on startup: {e}");
                                    // Emit event for frontend to show error toast
                                    let _ = app_handle.emit(
                                        "credential-refresh-error",
                                        serde_json::json!({
                                            "error": e,
                                            "timestamp": chrono::Utc::now().to_rfc3339(),
                                        }),
                                    );
                                }
                            }
                        });

                        // Show window after state restored (prevents flash)
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                        }

                        Ok(())
                    }
                    Err(e) => {
                        log::error!("Failed to initialize: {e}");
                        Err(e.into())
                    }
                }
            })
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
