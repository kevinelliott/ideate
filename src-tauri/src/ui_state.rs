//! UI state persistence for panel layouts and window size.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};

use crate::macos;

/// Panel state for a single project.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectPanelState {
    pub log_panel_collapsed: bool,
    pub log_panel_height: f64,
    pub preview_panel_collapsed: bool,
    pub preview_panel_width: f64,
    pub terminal_panel_collapsed: bool,
    pub terminal_panel_height: f64,
    #[serde(default = "default_agent_panel_collapsed")]
    pub agent_panel_collapsed: bool,
    #[serde(default = "default_agent_panel_height")]
    pub agent_panel_height: f64,
}

fn default_agent_panel_collapsed() -> bool {
    true
}

fn default_agent_panel_height() -> f64 {
    200.0
}

/// Window state (position and size).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WindowState {
    pub width: f64,
    pub height: f64,
    pub x: Option<f64>,
    pub y: Option<f64>,
    pub maximized: bool,
}

impl Default for WindowState {
    fn default() -> Self {
        WindowState {
            width: 1200.0,
            height: 800.0,
            x: None,
            y: None,
            maximized: false,
        }
    }
}

/// Combined UI state for persistence.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct UiState {
    #[serde(default)]
    pub panel_states: HashMap<String, ProjectPanelState>,
    #[serde(default)]
    pub window_state: Option<WindowState>,
}

fn get_ui_state_path(app: &AppHandle) -> Result<PathBuf, String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data directory: {}", e))?;

    if !app_data_dir.exists() {
        fs::create_dir_all(&app_data_dir)
            .map_err(|e| format!("Failed to create app data directory: {}", e))?;
    }

    Ok(app_data_dir.join("ui-state.json"))
}

/// Loads UI state from disk.
#[tauri::command]
pub fn load_ui_state(app: AppHandle) -> Result<UiState, String> {
    let path = get_ui_state_path(&app)?;

    if !path.exists() {
        return Ok(UiState::default());
    }

    let content =
        fs::read_to_string(&path).map_err(|e| format!("Failed to read ui-state.json: {}", e))?;

    let state: UiState = serde_json::from_str(&content)
        .map_err(|e| format!("Failed to parse ui-state.json: {}", e))?;

    Ok(state)
}

/// Saves UI state to disk.
#[tauri::command(rename_all = "camelCase")]
pub fn save_ui_state(app: AppHandle, state: UiState) -> Result<(), String> {
    let path = get_ui_state_path(&app)?;

    let json = serde_json::to_string_pretty(&state)
        .map_err(|e| format!("Failed to serialize UI state: {}", e))?;

    fs::write(&path, json).map_err(|e| format!("Failed to write ui-state.json: {}", e))?;

    Ok(())
}

/// Saves just the panel states (convenience method).
#[tauri::command(rename_all = "camelCase")]
pub fn save_panel_states(
    app: AppHandle,
    panel_states: HashMap<String, ProjectPanelState>,
) -> Result<(), String> {
    let path = get_ui_state_path(&app)?;

    // Load existing state to preserve window state
    let mut state = if path.exists() {
        let content = fs::read_to_string(&path)
            .map_err(|e| format!("Failed to read ui-state.json: {}", e))?;
        serde_json::from_str(&content).unwrap_or_default()
    } else {
        UiState::default()
    };

    state.panel_states = panel_states;

    let json = serde_json::to_string_pretty(&state)
        .map_err(|e| format!("Failed to serialize UI state: {}", e))?;

    fs::write(&path, json).map_err(|e| format!("Failed to write ui-state.json: {}", e))?;

    Ok(())
}

/// Saves just the window state (convenience method).
#[tauri::command(rename_all = "camelCase")]
pub fn save_window_state(app: AppHandle, window_state: WindowState) -> Result<(), String> {
    let path = get_ui_state_path(&app)?;

    // Load existing state to preserve panel states
    let mut state = if path.exists() {
        let content = fs::read_to_string(&path)
            .map_err(|e| format!("Failed to read ui-state.json: {}", e))?;
        serde_json::from_str(&content).unwrap_or_default()
    } else {
        UiState::default()
    };

    state.window_state = Some(window_state);

    let json = serde_json::to_string_pretty(&state)
        .map_err(|e| format!("Failed to serialize UI state: {}", e))?;

    fs::write(&path, json).map_err(|e| format!("Failed to write ui-state.json: {}", e))?;

    Ok(())
}

/// Opens or focuses the Process Viewer window.
pub fn open_process_viewer(app: AppHandle) -> Result<(), String> {
    const WINDOW_LABEL: &str = "process-viewer";
    
    // Check if window already exists
    if let Some(window) = app.get_webview_window(WINDOW_LABEL) {
        // Focus existing window
        window.set_focus().map_err(|e| format!("Failed to focus window: {}", e))?;
        return Ok(());
    }
    
    // Create new window without a menu bar
    let url = WebviewUrl::App("/process-viewer".into());
    
    use tauri::menu::MenuBuilder;
    let empty_menu = MenuBuilder::new(&app).build().map_err(|e| format!("Failed to build menu: {}", e))?;
    
    WebviewWindowBuilder::new(&app, WINDOW_LABEL, url)
        .title("Process Viewer")
        .inner_size(900.0, 600.0)
        .min_inner_size(600.0, 400.0)
        .resizable(true)
        .menu(empty_menu)
        .build()
        .map_err(|e| format!("Failed to create process viewer window: {}", e))?;
    
    // Disable native fullscreen for new window to prevent macOS crash
    macos::disable_native_fullscreen_for_new_window();
    
    Ok(())
}

/// Tauri command to open the process viewer from frontend.
#[tauri::command]
pub fn open_process_viewer_command(app: AppHandle) -> Result<(), String> {
    open_process_viewer(app)
}

/// Opens or focuses the Story Manager window for a specific project.
#[tauri::command(rename_all = "camelCase")]
pub fn open_story_manager_command(app: AppHandle, project_id: String, project_name: String) -> Result<(), String> {
    // Use project-specific window label
    let window_label = format!("story-manager-{}", project_id.replace("-", "").chars().take(12).collect::<String>());
    
    // Check if window already exists
    if let Some(window) = app.get_webview_window(&window_label) {
        // Focus existing window
        window.set_focus().map_err(|e| format!("Failed to focus window: {}", e))?;
        return Ok(());
    }
    
    // Create new window with projectId as query parameter
    let url = WebviewUrl::App(format!("/story-manager?projectId={}", project_id).into());
    
    use tauri::menu::MenuBuilder;
    let empty_menu = MenuBuilder::new(&app).build().map_err(|e| format!("Failed to build menu: {}", e))?;
    
    WebviewWindowBuilder::new(&app, &window_label, url)
        .title(format!("Story Manager - {}", project_name))
        .inner_size(800.0, 500.0)
        .min_inner_size(500.0, 300.0)
        .resizable(true)
        .menu(empty_menu)
        .build()
        .map_err(|e| format!("Failed to create story manager window: {}", e))?;
    
    // Disable native fullscreen for new window to prevent macOS crash
    macos::disable_native_fullscreen_for_new_window();
    
    Ok(())
}

/// Opens a new project window for a specific project.
#[tauri::command(rename_all = "camelCase")]
pub fn open_project_window(app: AppHandle, project_id: String, project_name: String) -> Result<(), String> {
    // Use project_id as window label (sanitized)
    let window_label = format!("project-{}", project_id.replace("-", "").chars().take(12).collect::<String>());
    
    // Check if window already exists
    if let Some(window) = app.get_webview_window(&window_label) {
        // Focus existing window
        window.set_focus().map_err(|e| format!("Failed to focus window: {}", e))?;
        return Ok(());
    }
    
    // Create new window with project_id as query parameter
    let url = WebviewUrl::App(format!("/?projectId={}", project_id).into());
    
    WebviewWindowBuilder::new(&app, &window_label, url)
        .title(format!("Ideate - {}", project_name))
        .inner_size(1200.0, 800.0)
        .min_inner_size(800.0, 600.0)
        .resizable(true)
        .build()
        .map_err(|e| format!("Failed to create project window: {}", e))?;
    
    // Disable native fullscreen for new window to prevent macOS crash
    macos::disable_native_fullscreen_for_new_window();
    
    Ok(())
}
