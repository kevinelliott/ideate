mod terminal;

#[cfg(target_os = "macos")]
#[macro_use]
extern crate objc;

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::io::{BufRead, BufReader};
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use std::thread;
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager};
use uuid::Uuid;
use regex::Regex;

#[cfg(target_os = "macos")]
use cocoa::appkit::{NSApplication, NSImage};
#[cfg(target_os = "macos")]
use cocoa::base::{id, nil};
#[cfg(target_os = "macos")]
use cocoa::foundation::NSString;

lazy_static::lazy_static! {
    static ref PROCESSES: Mutex<HashMap<String, Child>> = Mutex::new(HashMap::new());
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ProjectConfig {
    pub name: String,
    pub description: String,
    pub agent: Option<String>,
    pub autonomy: String,
    #[serde(default)]
    pub build_mode: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ProjectSettings {
    pub agent: Option<String>,
    pub autonomy: String,
    #[serde(default)]
    pub build_mode: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CreateProjectResult {
    pub path: String,
    pub config_path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StoredProject {
    pub id: String,
    pub name: String,
    pub description: String,
    pub path: String,
    pub status: String,
    #[serde(rename = "createdAt")]
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Story {
    pub id: String,
    pub title: String,
    pub description: String,
    #[serde(rename = "acceptanceCriteria")]
    pub acceptance_criteria: Vec<String>,
    pub priority: i32,
    pub passes: bool,
    #[serde(default)]
    pub status: Option<String>,
    pub notes: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Prd {
    #[serde(default)]
    pub project: Option<String>,
    #[serde(rename = "branchName", default)]
    pub branch_name: Option<String>,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(rename = "userStories")]
    pub user_stories: Vec<Story>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SpawnAgentResult {
    pub process_id: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct KillAgentResult {
    pub success: bool,
    pub message: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct WaitAgentResult {
    pub process_id: String,
    pub exit_code: Option<i32>,
    pub success: bool,
}

#[derive(Clone, Serialize)]
pub struct AgentOutputEvent {
    pub process_id: String,
    pub stream_type: String,
    pub content: String,
}

#[derive(Clone, Serialize)]
pub struct AgentExitEvent {
    pub process_id: String,
    pub exit_code: Option<i32>,
    pub success: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentPlugin {
    pub id: String,
    pub name: String,
    pub command: String,
    #[serde(rename = "argsTemplate")]
    pub args_template: Vec<String>,
    #[serde(rename = "workingDir")]
    pub working_dir: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StoryRetryInfo {
    #[serde(rename = "retryCount")]
    pub retry_count: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProjectState {
    #[serde(rename = "currentStoryId")]
    pub current_story_id: Option<String>,
    #[serde(rename = "storyStatuses")]
    pub story_statuses: HashMap<String, String>,
    #[serde(rename = "storyRetries")]
    pub story_retries: HashMap<String, StoryRetryInfo>,
    #[serde(rename = "buildPhase")]
    pub build_phase: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CostEntry {
    pub id: String,
    #[serde(rename = "projectId")]
    pub project_id: String,
    pub timestamp: String,
    #[serde(rename = "agentId")]
    pub agent_id: String,
    pub description: String,
    #[serde(rename = "inputTokens", default)]
    pub input_tokens: Option<i64>,
    #[serde(rename = "outputTokens", default)]
    pub output_tokens: Option<i64>,
    #[serde(rename = "totalTokens", default)]
    pub total_tokens: Option<i64>,
    #[serde(default)]
    pub cost: Option<f64>,
    #[serde(default)]
    pub credits: Option<f64>,
    #[serde(default)]
    pub model: Option<String>,
    #[serde(rename = "threadId", default)]
    pub thread_id: Option<String>,
    #[serde(rename = "durationMs", default)]
    pub duration_ms: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CostHistory {
    pub entries: Vec<CostEntry>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Idea {
    pub id: String,
    pub title: String,
    pub summary: String,
    pub description: String,
    #[serde(rename = "createdAt")]
    pub created_at: String,
    #[serde(rename = "updatedAt")]
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentCliPath {
    #[serde(rename = "agentId")]
    pub agent_id: String,
    pub path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Preferences {
    #[serde(rename = "defaultAgent", default)]
    pub default_agent: Option<String>,
    #[serde(rename = "defaultAutonomy", default = "default_autonomy")]
    pub default_autonomy: String,
    #[serde(rename = "defaultBuildMode", default = "default_build_mode")]
    pub default_build_mode: String,
    #[serde(rename = "logBufferSize", default = "default_log_buffer_size")]
    pub log_buffer_size: i32,
    #[serde(rename = "agentPaths", default)]
    pub agent_paths: Vec<AgentCliPath>,
    #[serde(default = "default_theme")]
    pub theme: String,
    #[serde(rename = "appIcon", default = "default_app_icon")]
    pub app_icon: String,
    #[serde(rename = "promptOverrides", default)]
    pub prompt_overrides: HashMap<String, String>,
}

fn default_autonomy() -> String {
    "autonomous".to_string()
}

fn default_build_mode() -> String {
    "ralph".to_string()
}

fn default_log_buffer_size() -> i32 {
    1000
}

fn default_app_icon() -> String {
    "transparent".to_string()
}

fn default_theme() -> String {
    "system".to_string()
}

impl Default for Preferences {
    fn default() -> Self {
        Preferences {
            default_agent: None,
            default_autonomy: default_autonomy(),
            default_build_mode: default_build_mode(),
            log_buffer_size: default_log_buffer_size(),
            agent_paths: Vec::new(),
            theme: default_theme(),
            app_icon: default_app_icon(),
            prompt_overrides: HashMap::new(),
        }
    }
}

// Amp Usage Data Structures
#[derive(Debug, Clone, Deserialize)]
struct AmpThread {
    #[serde(default)]
    created: Option<i64>,  // Unix timestamp in milliseconds
    #[serde(default)]
    title: Option<String>,
    #[serde(default)]
    messages: Vec<AmpMessage>,
}

#[derive(Debug, Clone, Deserialize)]
struct AmpMessage {
    #[serde(default)]
    role: Option<String>,
    #[serde(default)]
    usage: Option<AmpMessageUsage>,
}

#[derive(Debug, Clone, Deserialize)]
struct AmpMessageUsage {
    #[serde(rename = "inputTokens", default)]
    input_tokens: Option<i64>,
    #[serde(rename = "outputTokens", default)]
    output_tokens: Option<i64>,
    #[serde(rename = "cacheCreationInputTokens", default)]
    cache_creation_input_tokens: Option<i64>,
    #[serde(rename = "cacheReadInputTokens", default)]
    cache_read_input_tokens: Option<i64>,
    #[serde(default)]
    credits: Option<f64>,
    #[serde(default)]
    model: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AmpUsageEntry {
    #[serde(rename = "threadId")]
    pub thread_id: String,
    #[serde(rename = "threadTitle")]
    pub thread_title: Option<String>,
    pub timestamp: String,
    pub model: Option<String>,
    #[serde(rename = "inputTokens")]
    pub input_tokens: i64,
    #[serde(rename = "outputTokens")]
    pub output_tokens: i64,
    #[serde(rename = "totalTokens")]
    pub total_tokens: i64,
    #[serde(rename = "cacheCreationTokens")]
    pub cache_creation_tokens: i64,
    #[serde(rename = "cacheReadTokens")]
    pub cache_read_tokens: i64,
    pub credits: f64,
    #[serde(rename = "durationMs")]
    pub duration_ms: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AmpUsageSummary {
    pub entries: Vec<AmpUsageEntry>,
    #[serde(rename = "totalInputTokens")]
    pub total_input_tokens: i64,
    #[serde(rename = "totalOutputTokens")]
    pub total_output_tokens: i64,
    #[serde(rename = "totalTokens")]
    pub total_tokens: i64,
    #[serde(rename = "totalCredits")]
    pub total_credits: f64,
    #[serde(rename = "totalDurationMs")]
    pub total_duration_ms: i64,
    #[serde(rename = "threadCount")]
    pub thread_count: i32,
}

// Claude Code Usage Data Structures
#[derive(Debug, Clone, Deserialize)]
struct ClaudeMessageUsage {
    #[serde(default)]
    input_tokens: Option<i64>,
    #[serde(default)]
    output_tokens: Option<i64>,
    #[serde(default)]
    cache_creation_input_tokens: Option<i64>,
    #[serde(default)]
    cache_read_input_tokens: Option<i64>,
    #[serde(default)]
    service_tier: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
struct ClaudeMessage {
    #[serde(default)]
    model: Option<String>,
    #[serde(default)]
    usage: Option<ClaudeMessageUsage>,
}

#[derive(Debug, Clone, Deserialize)]
struct ClaudeSessionLine {
    #[serde(rename = "sessionId", default)]
    session_id: Option<String>,
    #[serde(default)]
    timestamp: Option<String>,
    #[serde(rename = "type", default)]
    entry_type: Option<String>,
    #[serde(default)]
    message: Option<ClaudeMessage>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClaudeUsageEntry {
    #[serde(rename = "sessionId")]
    pub session_id: String,
    #[serde(rename = "projectPath")]
    pub project_path: String,
    pub timestamp: String,
    pub model: Option<String>,
    #[serde(rename = "inputTokens")]
    pub input_tokens: i64,
    #[serde(rename = "outputTokens")]
    pub output_tokens: i64,
    #[serde(rename = "totalTokens")]
    pub total_tokens: i64,
    #[serde(rename = "cacheCreationTokens")]
    pub cache_creation_tokens: i64,
    #[serde(rename = "cacheReadTokens")]
    pub cache_read_tokens: i64,
    #[serde(rename = "durationMs")]
    pub duration_ms: i64,
    #[serde(rename = "serviceTier")]
    pub service_tier: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClaudeUsageSummary {
    pub entries: Vec<ClaudeUsageEntry>,
    #[serde(rename = "totalInputTokens")]
    pub total_input_tokens: i64,
    #[serde(rename = "totalOutputTokens")]
    pub total_output_tokens: i64,
    #[serde(rename = "totalTokens")]
    pub total_tokens: i64,
    #[serde(rename = "totalDurationMs")]
    pub total_duration_ms: i64,
    #[serde(rename = "sessionCount")]
    pub session_count: i32,
    #[serde(rename = "detectedTier")]
    pub detected_tier: Option<String>,
}

fn get_ideate_dir(project_path: &str) -> PathBuf {
    PathBuf::from(project_path).join(".ideate")
}

/// Sanitizes JSON content that may have common formatting issues from AI-generated output.
/// Handles trailing commas, single-line comments, and other common issues.
fn sanitize_json(content: &str) -> String {
    let mut result = content.to_string();
    
    // Remove single-line comments (// ...)
    let single_comment_re = Regex::new(r#"//[^
]*"#).unwrap();
    result = single_comment_re.replace_all(&result, "").to_string();
    
    // Remove multi-line comments (/* ... */)
    let multi_comment_re = Regex::new(r#"/\*[\s\S]*?\*/"#).unwrap();
    result = multi_comment_re.replace_all(&result, "").to_string();
    
    // Remove trailing commas before ] or }
    // Handle: [1, 2, 3,] or {"a": 1,}
    let trailing_comma_re = Regex::new(r#",(\s*[}\]])"#).unwrap();
    result = trailing_comma_re.replace_all(&result, "$1").to_string();
    
    // Handle multiple trailing commas
    for _ in 0..5 {
        let prev = result.clone();
        result = trailing_comma_re.replace_all(&result, "$1").to_string();
        if result == prev {
            break;
        }
    }
    
    result
}

#[cfg(target_os = "macos")]
fn set_app_icon_macos(icon_variant: &str) {
    use std::env;
    
    let exe_path = match env::current_exe() {
        Ok(path) => path,
        Err(_) => return,
    };
    
    // Navigate from binary to Resources folder
    // .app/Contents/MacOS/binary -> .app/Contents/Resources/
    let resources_dir = exe_path
        .parent() // MacOS
        .and_then(|p| p.parent()) // Contents
        .map(|p| p.join("Resources"));
    
    let resources_dir = match resources_dir {
        Some(dir) if dir.exists() => dir,
        _ => return,
    };
    
    // Map icon variant to filename
    let icon_filename = match icon_variant {
        "dark" => "icon-dark.png",
        "light" => "icon-light.png",
        "color" => "icon-color.png",
        "transparent" | _ => "icon.png",
    };
    
    let icon_path = resources_dir.join(icon_filename);
    
    if !icon_path.exists() {
        return;
    }
    
    unsafe {
        let path_str = icon_path.to_string_lossy();
        let ns_path = NSString::alloc(nil).init_str(&path_str);
        let image: id = msg_send![class!(NSImage), alloc];
        let image: id = msg_send![image, initWithContentsOfFile: ns_path];
        
        if image != nil {
            let app = NSApplication::sharedApplication(nil);
            let _: () = msg_send![app, setApplicationIconImage: image];
        }
    }
}

#[cfg(not(target_os = "macos"))]
fn set_app_icon_macos(_icon_variant: &str) {
    // No-op on non-macOS platforms
}

#[cfg(target_os = "macos")]
fn set_app_name_macos() {
    dispatch::Queue::main().exec_async(move || {
        unsafe {
            let app = NSApplication::sharedApplication(nil);
            
            // Get the main menu
            let main_menu: id = msg_send![app, mainMenu];
            if main_menu == nil {
                return;
            }
            
            // Get the first menu item (the app menu)
            let app_menu_item: id = msg_send![main_menu, itemAtIndex: 0i64];
            if app_menu_item == nil {
                return;
            }
            
            // Get the submenu (actual app menu)
            let app_submenu: id = msg_send![app_menu_item, submenu];
            if app_submenu == nil {
                return;
            }
            
            // Update the submenu title
            let title = NSString::alloc(nil).init_str("Ideate");
            let _: () = msg_send![app_submenu, setTitle: title];
            
            // Update individual menu items that contain the app name
            let item_count: i64 = msg_send![app_submenu, numberOfItems];
            for i in 0..item_count {
                let item: id = msg_send![app_submenu, itemAtIndex: i];
                if item != nil {
                    let item_title: id = msg_send![item, title];
                    if item_title != nil {
                        let title_str: *const std::os::raw::c_char = msg_send![item_title, UTF8String];
                        if !title_str.is_null() {
                            let title_rust = std::ffi::CStr::from_ptr(title_str).to_string_lossy();
                            
                            // Replace "Ideate" (the cargo package name) with "Ideate"
                            if title_rust.contains("Ideate") {
                                let new_title_str = title_rust.replace("Ideate", "Ideate");
                                let new_title = NSString::alloc(nil).init_str(&new_title_str);
                                let _: () = msg_send![item, setTitle: new_title];
                            }
                        }
                    }
                }
            }
        }
    });
}

#[cfg(not(target_os = "macos"))]
fn set_app_name_macos() {
    // No-op on non-macOS platforms
}

fn apply_icon_from_preferences(app: &AppHandle) {
    if let Ok(prefs) = load_preferences_internal(app) {
        set_app_icon_macos(&prefs.app_icon);
    }
}

fn load_preferences_internal(app: &AppHandle) -> Result<Preferences, String> {
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

#[tauri::command]
fn set_app_icon(icon_variant: String) -> Result<(), String> {
    set_app_icon_macos(&icon_variant);
    Ok(())
}

#[tauri::command]
fn create_project(name: String, description: String, base_path: String) -> Result<CreateProjectResult, String> {
    let project_dir = PathBuf::from(&base_path).join(&name);
    
    if project_dir.exists() {
        return Err(format!("Directory '{}' already exists", project_dir.display()));
    }
    
    fs::create_dir_all(&project_dir)
        .map_err(|e| format!("Failed to create project directory: {}", e))?;
    
    let ideate_dir = project_dir.join(".ideate");
    fs::create_dir_all(&ideate_dir)
        .map_err(|e| format!("Failed to create .ideate directory: {}", e))?;
    
    let config = ProjectConfig {
        name: name.clone(),
        description,
        agent: None,
        autonomy: "autonomous".to_string(),
        build_mode: Some("ralph".to_string()),
        created_at: chrono::Utc::now().to_rfc3339(),
    };
    
    let config_path = ideate_dir.join("config.json");
    let config_json = serde_json::to_string_pretty(&config)
        .map_err(|e| format!("Failed to serialize config: {}", e))?;
    
    fs::write(&config_path, config_json)
        .map_err(|e| format!("Failed to write config: {}", e))?;
    
    Ok(CreateProjectResult {
        path: project_dir.to_string_lossy().to_string(),
        config_path: config_path.to_string_lossy().to_string(),
    })
}

#[tauri::command]
fn import_project(path: String) -> Result<CreateProjectResult, String> {
    let project_dir = PathBuf::from(&path);
    
    if !project_dir.exists() {
        return Err(format!("Directory '{}' does not exist", path));
    }
    
    let ideate_dir = project_dir.join(".ideate");
    if !ideate_dir.exists() {
        fs::create_dir_all(&ideate_dir)
            .map_err(|e| format!("Failed to create .ideate directory: {}", e))?;
    }
    
    let config_path = ideate_dir.join("config.json");
    
    if !config_path.exists() {
        let project_name = project_dir
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("Imported Project")
            .to_string();
        
        let config = ProjectConfig {
            name: project_name,
            description: "Imported project".to_string(),
            agent: None,
            autonomy: "autonomous".to_string(),
            build_mode: Some("ralph".to_string()),
            created_at: chrono::Utc::now().to_rfc3339(),
        };
        
        let config_json = serde_json::to_string_pretty(&config)
            .map_err(|e| format!("Failed to serialize config: {}", e))?;
        
        fs::write(&config_path, config_json)
            .map_err(|e| format!("Failed to write config: {}", e))?;
    }
    
    Ok(CreateProjectResult {
        path: project_dir.to_string_lossy().to_string(),
        config_path: config_path.to_string_lossy().to_string(),
    })
}

fn get_projects_file_path(app: &AppHandle) -> Result<PathBuf, String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data directory: {}", e))?;
    
    if !app_data_dir.exists() {
        fs::create_dir_all(&app_data_dir)
            .map_err(|e| format!("Failed to create app data directory: {}", e))?;
    }
    
    Ok(app_data_dir.join("projects.json"))
}

#[tauri::command]
fn load_projects(app: AppHandle) -> Result<Vec<StoredProject>, String> {
    let projects_path = get_projects_file_path(&app)?;
    
    if !projects_path.exists() {
        return Ok(Vec::new());
    }
    
    let content = fs::read_to_string(&projects_path)
        .map_err(|e| format!("Failed to read projects.json: {}", e))?;
    
    let projects: Vec<StoredProject> = serde_json::from_str(&content)
        .map_err(|e| format!("Failed to parse projects.json: {}", e))?;
    
    Ok(projects)
}

#[tauri::command]
fn save_projects(app: AppHandle, projects: Vec<StoredProject>) -> Result<(), String> {
    let projects_path = get_projects_file_path(&app)?;
    
    let projects_json = serde_json::to_string_pretty(&projects)
        .map_err(|e| format!("Failed to serialize projects: {}", e))?;
    
    fs::write(&projects_path, projects_json)
        .map_err(|e| format!("Failed to write projects.json: {}", e))?;
    
    Ok(())
}

#[tauri::command]
fn load_prd(project_path: String) -> Result<Option<Prd>, String> {
    let prd_path = get_ideate_dir(&project_path).join("prd.json");
    
    if !prd_path.exists() {
        return Ok(None);
    }
    
    let content = fs::read_to_string(&prd_path)
        .map_err(|e| format!("Failed to read prd.json: {}", e))?;
    
    // Sanitize the JSON before parsing (handles trailing commas, comments, etc.)
    let sanitized = sanitize_json(&content);
    
    let prd: Prd = serde_json::from_str(&sanitized)
        .map_err(|e| format!("Failed to parse prd.json: {}", e))?;
    
    Ok(Some(prd))
}

#[tauri::command]
fn save_prd(project_path: String, prd: Prd) -> Result<(), String> {
    let ideate_dir = get_ideate_dir(&project_path);
    
    if !ideate_dir.exists() {
        fs::create_dir_all(&ideate_dir)
            .map_err(|e| format!("Failed to create .ideate directory: {}", e))?;
    }
    
    let prd_path = ideate_dir.join("prd.json");
    
    let prd_json = serde_json::to_string_pretty(&prd)
        .map_err(|e| format!("Failed to serialize PRD: {}", e))?;
    
    fs::write(&prd_path, prd_json)
        .map_err(|e| format!("Failed to write prd.json: {}", e))?;
    
    Ok(())
}

#[tauri::command]
fn load_project_settings(project_path: String) -> Result<Option<ProjectSettings>, String> {
    let config_path = get_ideate_dir(&project_path).join("config.json");
    
    if !config_path.exists() {
        return Ok(None);
    }
    
    let content = fs::read_to_string(&config_path)
        .map_err(|e| format!("Failed to read config.json: {}", e))?;
    
    let config: ProjectConfig = serde_json::from_str(&content)
        .map_err(|e| format!("Failed to parse config.json: {}", e))?;
    
    Ok(Some(ProjectSettings {
        agent: config.agent,
        autonomy: config.autonomy,
        build_mode: config.build_mode,
    }))
}

#[tauri::command]
fn save_project_settings(project_path: String, settings: ProjectSettings) -> Result<(), String> {
    let config_path = get_ideate_dir(&project_path).join("config.json");
    
    // Load existing config to preserve other fields
    let mut config = if config_path.exists() {
        let content = fs::read_to_string(&config_path)
            .map_err(|e| format!("Failed to read config.json: {}", e))?;
        serde_json::from_str::<ProjectConfig>(&content)
            .map_err(|e| format!("Failed to parse config.json: {}", e))?
    } else {
        return Err("Config file does not exist".to_string());
    };
    
    // Update settings
    config.agent = settings.agent;
    config.autonomy = settings.autonomy;
    config.build_mode = settings.build_mode;
    
    let config_json = serde_json::to_string_pretty(&config)
        .map_err(|e| format!("Failed to serialize config: {}", e))?;
    
    fs::write(&config_path, config_json)
        .map_err(|e| format!("Failed to write config.json: {}", e))?;
    
    Ok(())
}

#[tauri::command]
fn load_project_state(project_path: String) -> Result<Option<ProjectState>, String> {
    let state_path = get_ideate_dir(&project_path).join("state.json");
    
    if !state_path.exists() {
        return Ok(None);
    }
    
    let content = fs::read_to_string(&state_path)
        .map_err(|e| format!("Failed to read state.json: {}", e))?;
    
    let state: ProjectState = serde_json::from_str(&content)
        .map_err(|e| format!("Failed to parse state.json: {}", e))?;
    
    Ok(Some(state))
}

#[tauri::command]
fn save_project_state(project_path: String, state: ProjectState) -> Result<(), String> {
    let ideate_dir = get_ideate_dir(&project_path);
    
    if !ideate_dir.exists() {
        fs::create_dir_all(&ideate_dir)
            .map_err(|e| format!("Failed to create .ideate directory: {}", e))?;
    }
    
    let state_path = ideate_dir.join("state.json");
    
    let state_json = serde_json::to_string_pretty(&state)
        .map_err(|e| format!("Failed to serialize state: {}", e))?;
    
    fs::write(&state_path, state_json)
        .map_err(|e| format!("Failed to write state.json: {}", e))?;
    
    Ok(())
}

#[tauri::command]
fn load_cost_history(project_path: String) -> Result<CostHistory, String> {
    let cost_path = get_ideate_dir(&project_path).join("costs.json");
    
    if !cost_path.exists() {
        return Ok(CostHistory {
            entries: Vec::new(),
        });
    }
    
    let content = fs::read_to_string(&cost_path)
        .map_err(|e| format!("Failed to read costs.json: {}", e))?;
    
    let history: CostHistory = serde_json::from_str(&content)
        .map_err(|e| format!("Failed to parse costs.json: {}", e))?;
    
    Ok(history)
}

#[tauri::command]
fn save_cost_history(project_path: String, history: CostHistory) -> Result<(), String> {
    let ideate_dir = get_ideate_dir(&project_path);
    
    if !ideate_dir.exists() {
        fs::create_dir_all(&ideate_dir)
            .map_err(|e| format!("Failed to create .ideate directory: {}", e))?;
    }
    
    let cost_path = ideate_dir.join("costs.json");
    
    let history_json = serde_json::to_string_pretty(&history)
        .map_err(|e| format!("Failed to serialize cost history: {}", e))?;
    
    fs::write(&cost_path, history_json)
        .map_err(|e| format!("Failed to write costs.json: {}", e))?;
    
    Ok(())
}

#[tauri::command]
fn load_preferences(app: AppHandle) -> Result<Preferences, String> {
    load_preferences_internal(&app)
}

#[tauri::command]
fn save_preferences(app: AppHandle, preferences: Preferences) -> Result<(), String> {
    let prefs_path = get_preferences_file_path(&app)?;
    
    let prefs_json = serde_json::to_string_pretty(&preferences)
        .map_err(|e| format!("Failed to serialize preferences: {}", e))?;
    
    fs::write(&prefs_path, prefs_json)
        .map_err(|e| format!("Failed to write preferences.json: {}", e))?;
    
    set_app_icon_macos(&preferences.app_icon);
    
    Ok(())
}

#[tauri::command]
fn open_full_disk_access_settings() -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        Command::new("open")
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

fn get_preferences_file_path(app: &AppHandle) -> Result<PathBuf, String> {
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

#[tauri::command]
fn load_ideas(app: AppHandle) -> Result<Vec<Idea>, String> {
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

#[tauri::command]
fn save_ideas(app: AppHandle, ideas: Vec<Idea>) -> Result<(), String> {
    let ideas_path = get_ideas_file_path(&app)?;
    
    let ideas_json = serde_json::to_string_pretty(&ideas)
        .map_err(|e| format!("Failed to serialize ideas: {}", e))?;
    
    fs::write(&ideas_path, ideas_json)
        .map_err(|e| format!("Failed to write ideas.json: {}", e))?;
    
    Ok(())
}

#[tauri::command]
fn list_agents() -> Result<Vec<AgentPlugin>, String> {
    let agents = vec![
        AgentPlugin {
            id: "amp".to_string(),
            name: "Amp".to_string(),
            command: "amp".to_string(),
            args_template: vec![
                "--print".to_string(),
                "-m".to_string(),
                "{{prompt}}".to_string(),
            ],
            working_dir: "{{projectPath}}".to_string(),
        },
        AgentPlugin {
            id: "claude-code".to_string(),
            name: "Claude Code".to_string(),
            command: "claude".to_string(),
            args_template: vec![
                "--print".to_string(),
                "-p".to_string(),
                "{{prompt}}".to_string(),
            ],
            working_dir: "{{projectPath}}".to_string(),
        },
    ];
    Ok(agents)
}

#[tauri::command]
async fn load_amp_usage(since_timestamp: Option<i64>) -> Result<AmpUsageSummary, String> {
    // Move the heavy file I/O to a blocking thread pool to avoid freezing the UI
    tokio::task::spawn_blocking(move || {
        load_amp_usage_sync(since_timestamp)
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?
}

fn load_amp_usage_sync(since_timestamp: Option<i64>) -> Result<AmpUsageSummary, String> {
    let home_dir = dirs::home_dir()
        .ok_or_else(|| "Could not find home directory".to_string())?;

    let amp_threads_dir = home_dir.join(".local").join("share").join("amp").join("threads");

    if !amp_threads_dir.exists() {
        return Ok(AmpUsageSummary {
            entries: Vec::new(),
            total_input_tokens: 0,
            total_output_tokens: 0,
            total_tokens: 0,
            total_credits: 0.0,
            total_duration_ms: 0,
            thread_count: 0,
        });
    }

    let pattern = amp_threads_dir.join("T-*.json");
    let pattern_str = pattern.to_string_lossy();

    let mut entries: Vec<AmpUsageEntry> = Vec::new();
    let mut thread_count = 0;

    for path in glob::glob(&pattern_str).map_err(|e| format!("Glob pattern error: {}", e))? {
        if let Ok(thread_path) = path {
            // Get file modification time for duration calculation
            let file_mtime_ms = fs::metadata(&thread_path)
                .ok()
                .and_then(|m| m.modified().ok())
                .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                .map(|d| d.as_millis() as i64)
                .unwrap_or(0);

            if let Ok(content) = fs::read_to_string(&thread_path) {
                if let Ok(thread) = serde_json::from_str::<AmpThread>(&content) {
                    // created is already in milliseconds
                    let created_at_ms = thread.created;

                    // Filter by since_timestamp if provided
                    if let Some(since) = since_timestamp {
                        if let Some(created_ms) = created_at_ms {
                            if created_ms < since {
                                continue;
                            }
                        }
                    }

                    // Aggregate usage from all assistant messages
                    let mut input_tokens: i64 = 0;
                    let mut output_tokens: i64 = 0;
                    let mut cache_creation_tokens: i64 = 0;
                    let mut cache_read_tokens: i64 = 0;
                    let mut credits: f64 = 0.0;
                    let mut last_model: Option<String> = None;

                    for msg in &thread.messages {
                        if msg.role.as_deref() == Some("assistant") {
                            if let Some(usage) = &msg.usage {
                                input_tokens += usage.input_tokens.unwrap_or(0);
                                output_tokens += usage.output_tokens.unwrap_or(0);
                                cache_creation_tokens += usage.cache_creation_input_tokens.unwrap_or(0);
                                cache_read_tokens += usage.cache_read_input_tokens.unwrap_or(0);
                                credits += usage.credits.unwrap_or(0.0);
                                if usage.model.is_some() {
                                    last_model = usage.model.clone();
                                }
                            }
                        }
                    }

                    // Calculate duration from creation to last modification
                    let duration_ms = match created_at_ms {
                        Some(created) if file_mtime_ms > created => file_mtime_ms - created,
                        _ => 0,
                    };

                    // Only add if there's actual usage
                    if input_tokens > 0 || output_tokens > 0 || credits > 0.0 {
                        thread_count += 1;

                        let thread_id = thread_path
                            .file_stem()
                            .and_then(|s| s.to_str())
                            .unwrap_or("unknown")
                            .to_string();

                        // Format timestamp from unix ms to ISO string
                        let timestamp = created_at_ms
                            .map(|ms| {
                                chrono::DateTime::from_timestamp_millis(ms)
                                    .map(|dt| dt.to_rfc3339())
                                    .unwrap_or_else(|| "unknown".to_string())
                            })
                            .unwrap_or_else(|| "unknown".to_string());

                        let entry = AmpUsageEntry {
                            thread_id,
                            thread_title: thread.title.clone(),
                            timestamp,
                            model: last_model,
                            input_tokens,
                            output_tokens,
                            total_tokens: input_tokens + output_tokens,
                            cache_creation_tokens,
                            cache_read_tokens,
                            credits,
                            duration_ms,
                        };
                        entries.push(entry);
                    }
                }
            }
        }
    }

    let total_input_tokens: i64 = entries.iter().map(|e| e.input_tokens).sum();
    let total_output_tokens: i64 = entries.iter().map(|e| e.output_tokens).sum();
    let total_tokens: i64 = entries.iter().map(|e| e.total_tokens).sum();
    let total_credits: f64 = entries.iter().map(|e| e.credits).sum();
    let total_duration_ms: i64 = entries.iter().map(|e| e.duration_ms).sum();

    Ok(AmpUsageSummary {
        entries,
        total_input_tokens,
        total_output_tokens,
        total_tokens,
        total_credits,
        total_duration_ms,
        thread_count,
    })
}

#[tauri::command]
async fn load_claude_usage(since_timestamp: Option<i64>) -> Result<ClaudeUsageSummary, String> {
    tokio::task::spawn_blocking(move || {
        load_claude_usage_sync(since_timestamp)
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?
}

fn load_claude_usage_sync(since_timestamp: Option<i64>) -> Result<ClaudeUsageSummary, String> {
    let home_dir = dirs::home_dir()
        .ok_or_else(|| "Could not find home directory".to_string())?;
    
    let claude_projects_dir = home_dir.join(".claude").join("projects");
    
    if !claude_projects_dir.exists() {
        return Ok(ClaudeUsageSummary {
            entries: Vec::new(),
            total_input_tokens: 0,
            total_output_tokens: 0,
            total_tokens: 0,
            total_duration_ms: 0,
            session_count: 0,
            detected_tier: None,
        });
    }
    
    // Find all JSONL session files: ~/.claude/projects/*/*.jsonl
    let pattern = claude_projects_dir.join("*").join("*.jsonl");
    let pattern_str = pattern.to_string_lossy();
    
    let mut entries: Vec<ClaudeUsageEntry> = Vec::new();
    let mut session_count = 0;
    let mut latest_service_tier: Option<String> = None;
    let mut latest_timestamp: Option<i64> = None;
    
    for path in glob::glob(&pattern_str).map_err(|e| format!("Glob pattern error: {}", e))? {
        if let Ok(session_path) = path {
            // Extract project path from the parent directory name
            let project_name = session_path
                .parent()
                .and_then(|p| p.file_name())
                .and_then(|n| n.to_str())
                .unwrap_or("unknown")
                .to_string();
            
            // Session ID is the filename without .jsonl
            let session_id = session_path
                .file_stem()
                .and_then(|s| s.to_str())
                .unwrap_or("unknown")
                .to_string();
            
            if let Ok(file_content) = fs::read_to_string(&session_path) {
                let mut total_input: i64 = 0;
                let mut total_output: i64 = 0;
                let mut total_cache_creation: i64 = 0;
                let mut total_cache_read: i64 = 0;
                let mut first_model: Option<String> = None;
                let mut first_timestamp: Option<i64> = None;
                let mut last_timestamp: Option<i64> = None;
                let mut session_service_tier: Option<String> = None;
                let mut has_usage = false;
                
                for line in file_content.lines() {
                    if let Ok(entry) = serde_json::from_str::<ClaudeSessionLine>(line) {
                        // Parse timestamp
                        if let Some(ts_str) = &entry.timestamp {
                            if let Ok(dt) = chrono::DateTime::parse_from_rfc3339(ts_str) {
                                let ts_ms = dt.timestamp_millis();
                                if first_timestamp.is_none() {
                                    first_timestamp = Some(ts_ms);
                                }
                                last_timestamp = Some(ts_ms);
                            }
                        }
                        
                        // Extract usage from assistant messages
                        if entry.entry_type.as_deref() == Some("assistant") {
                            if let Some(message) = &entry.message {
                                if first_model.is_none() {
                                    first_model = message.model.clone();
                                }
                                
                                if let Some(usage) = &message.usage {
                                    has_usage = true;
                                    total_input += usage.input_tokens.unwrap_or(0);
                                    total_output += usage.output_tokens.unwrap_or(0);
                                    total_cache_creation += usage.cache_creation_input_tokens.unwrap_or(0);
                                    total_cache_read += usage.cache_read_input_tokens.unwrap_or(0);
                                    
                                    // Track the most recent service tier
                                    if usage.service_tier.is_some() {
                                        session_service_tier = usage.service_tier.clone();
                                    }
                                }
                            }
                        }
                    }
                }
                
                // Filter by since_timestamp using first_timestamp
                if let Some(since) = since_timestamp {
                    if let Some(first_ts) = first_timestamp {
                        if first_ts < since {
                            continue;
                        }
                    }
                }
                
                // Only add if there was actual usage
                if has_usage && (total_input > 0 || total_output > 0) {
                    session_count += 1;
                    
                    let duration_ms = match (first_timestamp, last_timestamp) {
                        (Some(first), Some(last)) if last > first => last - first,
                        _ => 0,
                    };
                    
                    let timestamp = first_timestamp
                        .and_then(|ts| chrono::DateTime::from_timestamp(ts / 1000, 0))
                        .map(|dt| dt.to_rfc3339())
                        .unwrap_or_else(|| "unknown".to_string());
                    
                    // Track the latest service tier across all sessions
                    if let Some(ts) = last_timestamp {
                        if latest_timestamp.is_none() || ts > latest_timestamp.unwrap_or(0) {
                            if session_service_tier.is_some() {
                                latest_timestamp = Some(ts);
                                latest_service_tier = session_service_tier.clone();
                            }
                        }
                    }
                    
                    let entry = ClaudeUsageEntry {
                        session_id,
                        project_path: project_name,
                        timestamp,
                        model: first_model,
                        input_tokens: total_input,
                        output_tokens: total_output,
                        total_tokens: total_input + total_output,
                        cache_creation_tokens: total_cache_creation,
                        cache_read_tokens: total_cache_read,
                        duration_ms,
                        service_tier: session_service_tier,
                    };
                    entries.push(entry);
                }
            }
        }
    }
    
    let total_input_tokens: i64 = entries.iter().map(|e| e.input_tokens).sum();
    let total_output_tokens: i64 = entries.iter().map(|e| e.output_tokens).sum();
    let total_tokens: i64 = entries.iter().map(|e| e.total_tokens).sum();
    let total_duration_ms: i64 = entries.iter().map(|e| e.duration_ms).sum();
    
    // Map service tier to user-friendly name
    let detected_tier = latest_service_tier.map(|tier| {
        match tier.as_str() {
            "standard" => "Pro".to_string(),
            "scale" | "max_5x" => "Max (5x)".to_string(),
            "max_20x" => "Max (20x)".to_string(),
            other => other.to_string(),
        }
    });
    
    Ok(ClaudeUsageSummary {
        entries,
        total_input_tokens,
        total_output_tokens,
        total_tokens,
        total_duration_ms,
        session_count,
        detected_tier,
    })
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RecentThreadDuration {
    #[serde(rename = "threadId")]
    pub thread_id: Option<String>,
    #[serde(rename = "durationMs")]
    pub duration_ms: i64,
}

#[tauri::command]
async fn get_recent_amp_thread_duration(since_ms: i64) -> Result<RecentThreadDuration, String> {
    tokio::task::spawn_blocking(move || {
        get_recent_amp_thread_duration_sync(since_ms)
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?
}

fn get_recent_amp_thread_duration_sync(since_ms: i64) -> Result<RecentThreadDuration, String> {
    let home_dir = dirs::home_dir()
        .ok_or_else(|| "Could not find home directory".to_string())?;
    
    let amp_threads_dir = home_dir.join(".local").join("share").join("amp").join("threads");
    
    if !amp_threads_dir.exists() {
        return Ok(RecentThreadDuration {
            thread_id: None,
            duration_ms: 0,
        });
    }
    
    let pattern = amp_threads_dir.join("T-*.json");
    let pattern_str = pattern.to_string_lossy();
    
    let mut most_recent: Option<(PathBuf, i64)> = None;
    
    // Find the most recently modified thread file that was modified after since_ms
    for path in glob::glob(&pattern_str).map_err(|e| format!("Glob pattern error: {}", e))? {
        if let Ok(thread_path) = path {
            if let Ok(metadata) = fs::metadata(&thread_path) {
                if let Ok(modified) = metadata.modified() {
                    if let Ok(duration) = modified.duration_since(std::time::UNIX_EPOCH) {
                        let mtime_ms = duration.as_millis() as i64;
                        // Only consider files modified after since_ms
                        if mtime_ms >= since_ms {
                            match &most_recent {
                                None => most_recent = Some((thread_path, mtime_ms)),
                                Some((_, prev_mtime)) if mtime_ms > *prev_mtime => {
                                    most_recent = Some((thread_path, mtime_ms));
                                }
                                _ => {}
                            }
                        }
                    }
                }
            }
        }
    }

    // If we found a recent thread, calculate its duration
    if let Some((thread_path, file_mtime_ms)) = most_recent {
        if let Ok(content) = fs::read_to_string(&thread_path) {
            if let Ok(thread) = serde_json::from_str::<AmpThread>(&content) {
                if let Some(created_ms) = thread.created {
                    let duration_ms = file_mtime_ms - created_ms;

                    let thread_id = thread_path
                        .file_stem()
                        .and_then(|s| s.to_str())
                        .map(|s| s.to_string());

                    return Ok(RecentThreadDuration {
                        thread_id,
                        duration_ms,
                    });
                }
            }
        }
    }

    Ok(RecentThreadDuration {
        thread_id: None,
        duration_ms: 0,
    })
}

#[derive(Debug, Clone, Deserialize)]
struct ClaudeSessionEntry {
    #[serde(rename = "sessionId", default)]
    session_id: Option<String>,
    #[serde(default)]
    timestamp: Option<String>,
}

#[tauri::command]
async fn get_recent_claude_session_duration(since_ms: i64) -> Result<RecentThreadDuration, String> {
    tokio::task::spawn_blocking(move || {
        get_recent_claude_session_duration_sync(since_ms)
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?
}

fn get_recent_claude_session_duration_sync(since_ms: i64) -> Result<RecentThreadDuration, String> {
    let home_dir = dirs::home_dir()
        .ok_or_else(|| "Could not find home directory".to_string())?;
    
    let claude_projects_dir = home_dir.join(".claude").join("projects");
    
    if !claude_projects_dir.exists() {
        return Ok(RecentThreadDuration {
            thread_id: None,
            duration_ms: 0,
        });
    }
    
    let pattern = claude_projects_dir.join("*").join("*.jsonl");
    let pattern_str = pattern.to_string_lossy();
    
    let mut most_recent: Option<(PathBuf, i64)> = None;
    
    // Find the most recently modified session file that was modified after since_ms
    for path in glob::glob(&pattern_str).map_err(|e| format!("Glob pattern error: {}", e))? {
        if let Ok(session_path) = path {
            if let Ok(metadata) = fs::metadata(&session_path) {
                if let Ok(modified) = metadata.modified() {
                    if let Ok(duration) = modified.duration_since(std::time::UNIX_EPOCH) {
                        let mtime_ms = duration.as_millis() as i64;
                        // Only consider files modified after since_ms
                        if mtime_ms >= since_ms {
                            match &most_recent {
                                None => most_recent = Some((session_path, mtime_ms)),
                                Some((_, prev_mtime)) if mtime_ms > *prev_mtime => {
                                    most_recent = Some((session_path, mtime_ms));
                                }
                                _ => {}
                            }
                        }
                    }
                }
            }
        }
    }
    
    // If we found a recent session, calculate its duration
    if let Some((session_path, file_mtime_ms)) = most_recent {
        if let Ok(content) = fs::read_to_string(&session_path) {
            // Read the first line to get the first timestamp
            if let Some(first_line) = content.lines().next() {
                if let Ok(entry) = serde_json::from_str::<ClaudeSessionEntry>(first_line) {
                    if let Some(ts_str) = &entry.timestamp {
                        if let Ok(dt) = chrono::DateTime::parse_from_rfc3339(ts_str) {
                            let created_ms = dt.timestamp_millis();
                            let duration_ms = file_mtime_ms - created_ms;
                            
                            let session_id = session_path
                                .file_stem()
                                .and_then(|s| s.to_str())
                                .map(|s| s.to_string());
                            
                            return Ok(RecentThreadDuration {
                                thread_id: session_id,
                                duration_ms,
                            });
                        }
                    }
                }
            }
        }
    }
    
    Ok(RecentThreadDuration {
        thread_id: None,
        duration_ms: 0,
    })
}


#[tauri::command]
fn spawn_agent(
    app: AppHandle,
    executable: String,
    args: Vec<String>,
    working_directory: String,
) -> Result<SpawnAgentResult, String> {
    let process_id = Uuid::new_v4().to_string();

    let mut child = Command::new(&executable)
        .args(&args)
        .current_dir(&working_directory)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to spawn process '{}': {}", executable, e))?;

    let stdout = child.stdout.take();
    let stderr = child.stderr.take();

    let pid_clone = process_id.clone();
    let app_clone = app.clone();
    if let Some(stdout) = stdout {
        thread::spawn(move || {
            let reader = BufReader::new(stdout);
            for line in reader.lines() {
                if let Ok(line) = line {
                    let event = AgentOutputEvent {
                        process_id: pid_clone.clone(),
                        stream_type: "stdout".to_string(),
                        content: line,
                    };
                    let _ = app_clone.emit("agent-output", event);
                }
            }
        });
    }

    let pid_clone2 = process_id.clone();
    let app_clone2 = app.clone();
    if let Some(stderr) = stderr {
        thread::spawn(move || {
            let reader = BufReader::new(stderr);
            for line in reader.lines() {
                if let Ok(line) = line {
                    let event = AgentOutputEvent {
                        process_id: pid_clone2.clone(),
                        stream_type: "stderr".to_string(),
                        content: line,
                    };
                    let _ = app_clone2.emit("agent-output", event);
                }
            }
        });
    }

    let mut processes = PROCESSES.lock().map_err(|e| format!("Lock error: {}", e))?;
    processes.insert(process_id.clone(), child);

    Ok(SpawnAgentResult { process_id })
}

#[tauri::command]
async fn wait_agent(app: AppHandle, process_id: String) -> Result<WaitAgentResult, String> {
    let result = tokio::task::spawn_blocking(move || {
        let mut processes = PROCESSES.lock().map_err(|e| format!("Lock error: {}", e))?;

        let child = match processes.get_mut(&process_id) {
            Some(child) => child,
            None => {
                return Ok(WaitAgentResult {
                    process_id: process_id.clone(),
                    exit_code: None,
                    success: false,
                });
            }
        };

        match child.wait() {
            Ok(status) => {
                let exit_code = status.code();
                let success = status.success();
                let result = WaitAgentResult {
                    process_id: process_id.clone(),
                    exit_code,
                    success,
                };
                processes.remove(&process_id);
                Ok(result)
            }
            Err(e) => {
                processes.remove(&process_id);
                Err(format!("Failed to wait for process: {}", e))
            }
        }
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))??;

    let event = AgentExitEvent {
        process_id: result.process_id.clone(),
        exit_code: result.exit_code,
        success: result.success,
    };
    let _ = app.emit("agent-exit", event);

    Ok(result)
}

#[tauri::command]
fn kill_agent(process_id: String) -> Result<KillAgentResult, String> {
    let mut processes = PROCESSES.lock().map_err(|e| format!("Lock error: {}", e))?;

    let child = match processes.get_mut(&process_id) {
        Some(child) => child,
        None => {
            return Ok(KillAgentResult {
                success: false,
                message: format!("Process {} not found", process_id),
            });
        }
    };

    #[cfg(unix)]
    {
        let pid = child.id();

        unsafe {
            libc::kill(pid as i32, libc::SIGTERM);
        }

        let start = std::time::Instant::now();
        let timeout = Duration::from_secs(5);

        loop {
            match child.try_wait() {
                Ok(Some(_status)) => {
                    processes.remove(&process_id);
                    return Ok(KillAgentResult {
                        success: true,
                        message: "Process terminated gracefully with SIGTERM".to_string(),
                    });
                }
                Ok(None) => {
                    if start.elapsed() >= timeout {
                        unsafe {
                            libc::kill(pid as i32, libc::SIGKILL);
                        }
                        let _ = child.wait();
                        processes.remove(&process_id);
                        return Ok(KillAgentResult {
                            success: true,
                            message: "Process killed with SIGKILL after timeout".to_string(),
                        });
                    }
                    thread::sleep(Duration::from_millis(100));
                }
                Err(e) => {
                    processes.remove(&process_id);
                    return Ok(KillAgentResult {
                        success: false,
                        message: format!("Error waiting for process: {}", e),
                    });
                }
            }
        }
    }

    #[cfg(windows)]
    {
        match child.kill() {
            Ok(()) => {
                let _ = child.wait();
                processes.remove(&process_id);
                Ok(KillAgentResult {
                    success: true,
                    message: "Process killed".to_string(),
                })
            }
            Err(e) => {
                processes.remove(&process_id);
                Ok(KillAgentResult {
                    success: false,
                    message: format!("Failed to kill process: {}", e),
                })
            }
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            apply_icon_from_preferences(&app.handle());
            set_app_name_macos();
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            create_project,
            import_project,
            load_projects,
            save_projects,
            load_prd,
            save_prd,
            load_project_settings,
            save_project_settings,
            load_project_state,
            save_project_state,
            load_cost_history,
            save_cost_history,
            load_preferences,
            save_preferences,
            set_app_icon,
            open_full_disk_access_settings,
            load_ideas,
            save_ideas,
            list_agents,
            load_amp_usage,
            load_claude_usage,
            get_recent_amp_thread_duration,
            get_recent_claude_session_duration,
            spawn_agent,
            wait_agent,
            kill_agent,
            terminal::spawn_terminal,
            terminal::write_terminal,
            terminal::resize_terminal,
            terminal::kill_terminal
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
