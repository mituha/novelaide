use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager, Runtime};
use crate::error::Result;

fn get_settings_file_path<R: Runtime>(app: &AppHandle<R>) -> Result<PathBuf> {
    let config_dir = app.path().app_config_dir()?;
    Ok(config_dir.join("settings.json"))
}

#[tauri::command]
pub async fn load_settings<R: Runtime>(app: AppHandle<R>) -> Result<serde_json::Value> {
    let path = get_settings_file_path(&app)?;
    if !path.exists() {
        return Ok(serde_json::json!({}));
    }

    let content = fs::read_to_string(&path)?;
    let value: serde_json::Value = serde_json::from_str(&content)?;
    Ok(value)
}

#[tauri::command]
pub async fn save_settings<R: Runtime>(
    app: AppHandle<R>,
    settings: serde_json::Value,
) -> Result<()> {
    let path = get_settings_file_path(&app)?;
    if let Some(parent) = path.parent() {
        if !parent.exists() {
            fs::create_dir_all(parent)?;
        }
    }

    let json_str = serde_json::to_string_pretty(&settings)?;
    fs::write(&path, json_str)?;
    Ok(())
}

#[tauri::command]
pub async fn reset_settings<R: Runtime>(app: AppHandle<R>) -> Result<()> {
    let path = get_settings_file_path(&app)?;
    if path.exists() {
        fs::remove_file(&path)?;
    }
    Ok(())
}

#[tauri::command]
pub async fn get_settings_path<R: Runtime>(app: AppHandle<R>) -> Result<String> {
    let path = get_settings_file_path(&app)?;
    Ok(path.to_string_lossy().to_string())
}
