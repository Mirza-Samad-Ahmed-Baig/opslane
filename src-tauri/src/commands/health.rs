use crate::state::AppState;

#[tauri::command]
pub async fn health_check() -> Result<String, String> {
    Ok("Application is running".to_string())
}

#[tauri::command]
pub async fn check_database(state: tauri::State<'_, AppState>) -> Result<String, String> {
    sqlx::query("SELECT 1")
        .execute(state.db.pool())
        .await
        .map_err(|e| format!("Database error: {e}"))?;

    Ok("Database connected successfully".to_string())
}
