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
    // Configure logging
    use env_logger::Builder;
    use log::LevelFilter;

    let mut builder = Builder::from_default_env();

    if cfg!(debug_assertions) {
        builder.filter_level(LevelFilter::Debug);
    } else {
        builder.filter_level(LevelFilter::Info);
    }

    builder.init();

    log::info!("Starting Opslane v{}", env!("CARGO_PKG_VERSION"));

    tauri::Builder::default()
        .plugin(tauri_plugin_log::Builder::default().build())
        .invoke_handler(tauri::generate_handler![
            // Legacy commands
            greet,
            get_system_info,
            // New commands
            health_check,
            check_database,
        ])
        .setup(|app| {
            tauri::async_runtime::block_on(async {
                match AppState::init().await {
                    Ok(state) => {
                        app.manage(state);
                        log::info!("Application ready");
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
