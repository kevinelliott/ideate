//! Ideas storage and management.

use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

use crate::models::Idea;

fn get_ideas_file_path(app: &AppHandle) -> Result<PathBuf, String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data directory: {}", e))?;
    
    if !app_data_dir.exists() {
        fs::create_dir_all(&app_data_dir)
            .map_err(|e| format!("Failed to create app data directory: {}", e))?;
    }
    
    Ok(app_data_dir.join("ideas.json"))
}

/// Loads all ideas from the app data directory.
#[tauri::command]
pub fn load_ideas(app: AppHandle) -> Result<Vec<Idea>, String> {
    let ideas_path = get_ideas_file_path(&app)?;
    
    if !ideas_path.exists() {
        return Ok(Vec::new());
    }
    
    let content = fs::read_to_string(&ideas_path)
        .map_err(|e| format!("Failed to read ideas.json: {}", e))?;
    
    let ideas: Vec<Idea> = serde_json::from_str(&content)
        .map_err(|e| format!("Failed to parse ideas.json: {}", e))?;
    
    Ok(ideas)
}

/// Saves all ideas to the app data directory.
#[tauri::command]
pub fn save_ideas(app: AppHandle, ideas: Vec<Idea>) -> Result<(), String> {
    let ideas_path = get_ideas_file_path(&app)?;
    
    let ideas_json = serde_json::to_string_pretty(&ideas)
        .map_err(|e| format!("Failed to serialize ideas: {}", e))?;
    
    fs::write(&ideas_path, ideas_json)
        .map_err(|e| format!("Failed to write ideas.json: {}", e))?;
    
    Ok(())
}
