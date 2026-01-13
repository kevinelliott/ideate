//! User preferences management.

use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

use crate::macos::set_app_icon;
use crate::models::Preferences;

/// Gets the path to the preferences file in the app data directory.
pub fn get_preferences_file_path(app: &AppHandle) -> Result<PathBuf, String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data directory: {}", e))?;
    
    if !app_data_dir.exists() {
        fs::create_dir_all(&app_data_dir)
            .map_err(|e| format!("Failed to create app data directory: {}", e))?;
    }
    
    Ok(app_data_dir.join("preferences.json"))
}

/// Loads preferences from disk (internal function, not a command).
pub fn load_preferences_internal(app: &AppHandle) -> Result<Preferences, String> {
    let prefs_path = get_preferences_file_path(app)?;
    
    if !prefs_path.exists() {
        return Ok(Preferences::default());
    }
    
    let content = fs::read_to_string(&prefs_path)
        .map_err(|e| format!("Failed to read preferences.json: {}", e))?;
    
    let prefs: Preferences = serde_json::from_str(&content)
        .map_err(|e| format!("Failed to parse preferences.json: {}", e))?;
    
    Ok(prefs)
}

/// Loads user preferences from the app data directory.
#[tauri::command]
pub fn load_preferences(app: AppHandle) -> Result<Preferences, String> {
    load_preferences_internal(&app)
}

/// Saves user preferences to the app data directory.
#[tauri::command]
pub fn save_preferences(app: AppHandle, preferences: Preferences) -> Result<(), String> {
    let prefs_path = get_preferences_file_path(&app)?;
    
    let prefs_json = serde_json::to_string_pretty(&preferences)
        .map_err(|e| format!("Failed to serialize preferences: {}", e))?;
    
    fs::write(&prefs_path, prefs_json)
        .map_err(|e| format!("Failed to write preferences.json: {}", e))?;
    
    set_app_icon(&preferences.app_icon);
    
    Ok(())
}

/// Sets the application icon variant.
#[tauri::command]
pub fn set_app_icon_command(icon_variant: String) -> Result<(), String> {
    set_app_icon(&icon_variant);
    Ok(())
}

/// Opens the Full Disk Access settings panel on macOS.
#[tauri::command]
pub fn open_full_disk_access_settings() -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg("x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles")
            .spawn()
            .map_err(|e| format!("Failed to open System Settings: {}", e))?;
    }
    
    #[cfg(not(target_os = "macos"))]
    {
        return Err("Full Disk Access settings are only available on macOS".to_string());
    }
    
    Ok(())
}
