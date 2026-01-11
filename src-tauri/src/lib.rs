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

lazy_static::lazy_static! {
    static ref PROCESSES: Mutex<HashMap<String, Child>> = Mutex::new(HashMap::new());
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ProjectConfig {
    pub name: String,
    pub description: String,
    pub agent: Option<String>,
    pub autonomy: String,
    pub created_at: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ProjectSettings {
    pub agent: Option<String>,
    pub autonomy: String,
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
    #[serde(rename = "logBufferSize", default = "default_log_buffer_size")]
    pub log_buffer_size: i32,
    #[serde(rename = "agentPaths", default)]
    pub agent_paths: Vec<AgentCliPath>,
    #[serde(default = "default_theme")]
    pub theme: String,
}

fn default_autonomy() -> String {
    "pause-between".to_string()
}

fn default_log_buffer_size() -> i32 {
    1000
}

fn default_theme() -> String {
    "system".to_string()
}

impl Default for Preferences {
    fn default() -> Self {
        Preferences {
            default_agent: None,
            default_autonomy: default_autonomy(),
            log_buffer_size: default_log_buffer_size(),
            agent_paths: Vec::new(),
            theme: default_theme(),
        }
    }
}

fn get_projects_file_path(app: &AppHandle) -> Result<PathBuf, String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data directory: {}", e))?;

    fs::create_dir_all(&app_data_dir)
        .map_err(|e| format!("Failed to create app data directory: {}", e))?;

    Ok(app_data_dir.join("projects.json"))
}

fn get_agents_file_path(app: &AppHandle) -> Result<PathBuf, String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data directory: {}", e))?;

    fs::create_dir_all(&app_data_dir)
        .map_err(|e| format!("Failed to create app data directory: {}", e))?;

    Ok(app_data_dir.join("agents.json"))
}

fn get_preferences_file_path(app: &AppHandle) -> Result<PathBuf, String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data directory: {}", e))?;

    fs::create_dir_all(&app_data_dir)
        .map_err(|e| format!("Failed to create app data directory: {}", e))?;

    Ok(app_data_dir.join("preferences.json"))
}

fn get_default_agents() -> Vec<AgentPlugin> {
    vec![
        AgentPlugin {
            id: "amp".to_string(),
            name: "Amp".to_string(),
            command: "amp".to_string(),
            args_template: vec!["-p".to_string(), "{{prompt}}".to_string()],
            working_dir: "project".to_string(),
        },
        AgentPlugin {
            id: "claude-code".to_string(),
            name: "Claude Code".to_string(),
            command: "claude".to_string(),
            args_template: vec!["-p".to_string(), "{{prompt}}".to_string()],
            working_dir: "project".to_string(),
        },
    ]
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
fn create_project(
    app: AppHandle,
    name: String,
    description: String,
    directory: String,
) -> Result<CreateProjectResult, String> {
    let project_path = PathBuf::from(&directory).join(&name);

    fs::create_dir_all(&project_path)
        .map_err(|e| format!("Failed to create project directory: {}", e))?;

    let ideate_dir = project_path.join(".ideate");
    fs::create_dir_all(&ideate_dir)
        .map_err(|e| format!("Failed to create .ideate directory: {}", e))?;

    let config = ProjectConfig {
        name: name.clone(),
        description,
        agent: None,
        autonomy: "pause-between".to_string(),
        created_at: chrono::Utc::now().to_rfc3339(),
    };

    let config_path = ideate_dir.join("config.json");
    let config_json = serde_json::to_string_pretty(&config)
        .map_err(|e| format!("Failed to serialize config: {}", e))?;

    fs::write(&config_path, config_json)
        .map_err(|e| format!("Failed to write config.json: {}", e))?;

    Ok(CreateProjectResult {
        path: project_path.to_string_lossy().to_string(),
        config_path: config_path.to_string_lossy().to_string(),
    })
}

#[tauri::command]
fn load_prd(project_path: String) -> Result<Option<Prd>, String> {
    let prd_path = PathBuf::from(&project_path).join(".ideate").join("prd.json");

    if !prd_path.exists() {
        return Ok(None);
    }

    let content = fs::read_to_string(&prd_path)
        .map_err(|e| format!("Failed to read prd.json: {}", e))?;

    let prd: Prd = serde_json::from_str(&content)
        .map_err(|e| format!("Failed to parse prd.json: {}", e))?;

    Ok(Some(prd))
}

#[tauri::command]
fn save_prd(project_path: String, prd: Prd) -> Result<(), String> {
    let ideate_dir = PathBuf::from(&project_path).join(".ideate");
    fs::create_dir_all(&ideate_dir)
        .map_err(|e| format!("Failed to create .ideate directory: {}", e))?;

    let prd_path = ideate_dir.join("prd.json");
    let prd_json = serde_json::to_string_pretty(&prd)
        .map_err(|e| format!("Failed to serialize PRD: {}", e))?;

    fs::write(&prd_path, prd_json)
        .map_err(|e| format!("Failed to write prd.json: {}", e))?;

    Ok(())
}

#[tauri::command]
fn load_project_settings(project_path: String) -> Result<Option<ProjectSettings>, String> {
    let config_path = PathBuf::from(&project_path)
        .join(".ideate")
        .join("config.json");

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
    }))
}

#[tauri::command]
fn save_project_settings(project_path: String, settings: ProjectSettings) -> Result<(), String> {
    let config_path = PathBuf::from(&project_path)
        .join(".ideate")
        .join("config.json");

    let mut config: ProjectConfig = if config_path.exists() {
        let content = fs::read_to_string(&config_path)
            .map_err(|e| format!("Failed to read config.json: {}", e))?;
        serde_json::from_str(&content).map_err(|e| format!("Failed to parse config.json: {}", e))?
    } else {
        ProjectConfig {
            name: "Unknown".to_string(),
            description: "".to_string(),
            agent: None,
            autonomy: "pause-between".to_string(),
            created_at: chrono::Utc::now().to_rfc3339(),
        }
    };

    config.agent = settings.agent;
    config.autonomy = settings.autonomy;

    let config_json = serde_json::to_string_pretty(&config)
        .map_err(|e| format!("Failed to serialize config: {}", e))?;

    fs::write(&config_path, config_json)
        .map_err(|e| format!("Failed to write config.json: {}", e))?;

    Ok(())
}

#[tauri::command]
fn load_project_state(project_path: String) -> Result<Option<ProjectState>, String> {
    let state_path = PathBuf::from(&project_path)
        .join(".ideate")
        .join("state.json");

    if !state_path.exists() {
        return Ok(None);
    }

    let content = fs::read_to_string(&state_path)
        .map_err(|e| format!("Failed to read state.json: {}", e))?;

    match serde_json::from_str::<ProjectState>(&content) {
        Ok(state) => Ok(Some(state)),
        Err(e) => {
            eprintln!("Warning: Failed to parse state.json, ignoring corrupt state: {}", e);
            Ok(None)
        }
    }
}

#[tauri::command]
fn save_project_state(project_path: String, state: ProjectState) -> Result<(), String> {
    let ideate_dir = PathBuf::from(&project_path).join(".ideate");
    fs::create_dir_all(&ideate_dir)
        .map_err(|e| format!("Failed to create .ideate directory: {}", e))?;

    let state_path = ideate_dir.join("state.json");
    let state_json = serde_json::to_string_pretty(&state)
        .map_err(|e| format!("Failed to serialize state: {}", e))?;

    fs::write(&state_path, state_json)
        .map_err(|e| format!("Failed to write state.json: {}", e))?;

    Ok(())
}

#[tauri::command]
fn load_preferences(app: AppHandle) -> Result<Preferences, String> {
    let prefs_path = get_preferences_file_path(&app)?;

    if !prefs_path.exists() {
        return Ok(Preferences::default());
    }

    let content = fs::read_to_string(&prefs_path)
        .map_err(|e| format!("Failed to read preferences.json: {}", e))?;

    let preferences: Preferences = serde_json::from_str(&content)
        .map_err(|e| format!("Failed to parse preferences.json: {}", e))?;

    Ok(preferences)
}

#[tauri::command]
fn save_preferences(app: AppHandle, preferences: Preferences) -> Result<(), String> {
    let prefs_path = get_preferences_file_path(&app)?;

    let prefs_json = serde_json::to_string_pretty(&preferences)
        .map_err(|e| format!("Failed to serialize preferences: {}", e))?;

    fs::write(&prefs_path, prefs_json)
        .map_err(|e| format!("Failed to write preferences.json: {}", e))?;

    Ok(())
}

#[tauri::command]
fn list_agents(app: AppHandle) -> Result<Vec<AgentPlugin>, String> {
    let agents_path = get_agents_file_path(&app)?;

    if !agents_path.exists() {
        return Ok(get_default_agents());
    }

    let content = fs::read_to_string(&agents_path)
        .map_err(|e| format!("Failed to read agents.json: {}", e))?;

    let agents: Vec<AgentPlugin> = serde_json::from_str(&content)
        .map_err(|e| format!("Failed to parse agents.json: {}", e))?;

    Ok(agents)
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
        .invoke_handler(tauri::generate_handler![
            create_project,
            load_projects,
            save_projects,
            load_prd,
            save_prd,
            load_project_settings,
            save_project_settings,
            load_project_state,
            save_project_state,
            load_preferences,
            save_preferences,
            list_agents,
            spawn_agent,
            wait_agent,
            kill_agent
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
