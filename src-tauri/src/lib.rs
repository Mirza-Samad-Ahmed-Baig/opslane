mod commands;
mod database;
mod error;
mod models;
mod services;
mod state;

use commands::*;
use state::AppState;
use tauri::Manager;

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

    let log_level = if cfg!(debug_assertions) {
        LevelFilter::Debug
    } else {
        LevelFilter::Info
    };

    tauri::Builder::default()
        .plugin(
            tauri_plugin_log::Builder::default()
                .level(log_level)
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
            list_sessions,
            delete_session,
            get_container_logs,
            open_container_terminal,
        ])
        .setup(|app| {
            log::info!("Starting Opslane v{}", env!("CARGO_PKG_VERSION"));

            tauri::async_runtime::block_on(async {
                match AppState::init().await {
                    Ok(state) => {
                        app.manage(state);
                        log::info!("Application ready");

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
