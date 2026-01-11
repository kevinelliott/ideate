use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
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

#[derive(Debug, Serialize, Deserialize)]
pub struct Story {
    pub id: String,
    pub title: String,
    pub description: String,
    #[serde(rename = "acceptanceCriteria")]
    pub acceptance_criteria: Vec<String>,
    pub priority: i32,
    pub passes: bool,
    pub notes: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Prd {
    pub project: Option<String>,
    #[serde(rename = "branchName")]
    pub branch_name: Option<String>,
    pub description: Option<String>,
    #[serde(rename = "userStories")]
    pub user_stories: Vec<Story>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SpawnAgentResult {
    pub process_id: String,
}

#[tauri::command]
fn create_project(
    name: String,
    description: String,
    directory: String,
) -> Result<CreateProjectResult, String> {
    let project_path = PathBuf::from(&directory).join(&name);
    let ideate_path = project_path.join(".ideate");
    let config_path = ideate_path.join("config.json");

    if project_path.exists() {
        return Err(format!(
            "Project folder already exists: {}",
            project_path.display()
        ));
    }

    fs::create_dir_all(&ideate_path).map_err(|e| format!("Failed to create project folder: {}", e))?;

    let config = ProjectConfig {
        name: name.clone(),
        description: description.clone(),
        agent: None,
        autonomy: "autonomous".to_string(),
        created_at: chrono::Utc::now().to_rfc3339(),
    };

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
fn load_prd(project_path: String) -> Result<Option<Vec<Story>>, String> {
    let prd_path = PathBuf::from(&project_path).join(".ideate").join("prd.json");

    if !prd_path.exists() {
        return Ok(None);
    }

    let content = fs::read_to_string(&prd_path)
        .map_err(|e| format!("Failed to read prd.json: {}", e))?;

    let prd: Prd = serde_json::from_str(&content)
        .map_err(|e| format!("Failed to parse prd.json: {}", e))?;

    Ok(Some(prd.user_stories))
}

#[tauri::command]
fn save_prd(project_path: String, stories: Vec<Story>) -> Result<(), String> {
    let ideate_path = PathBuf::from(&project_path).join(".ideate");
    let prd_path = ideate_path.join("prd.json");

    fs::create_dir_all(&ideate_path)
        .map_err(|e| format!("Failed to create .ideate folder: {}", e))?;

    let prd = Prd {
        project: None,
        branch_name: None,
        description: None,
        user_stories: stories,
    };

    let prd_json = serde_json::to_string_pretty(&prd)
        .map_err(|e| format!("Failed to serialize PRD: {}", e))?;

    fs::write(&prd_path, prd_json)
        .map_err(|e| format!("Failed to write prd.json: {}", e))?;

    Ok(())
}

#[tauri::command]
fn load_project_settings(project_path: String) -> Result<Option<ProjectSettings>, String> {
    let config_path = PathBuf::from(&project_path).join(".ideate").join("config.json");

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
fn save_project_settings(
    project_path: String,
    agent: Option<String>,
    autonomy: String,
) -> Result<(), String> {
    let ideate_path = PathBuf::from(&project_path).join(".ideate");
    let config_path = ideate_path.join("config.json");

    fs::create_dir_all(&ideate_path)
        .map_err(|e| format!("Failed to create .ideate folder: {}", e))?;

    let existing_config: Option<ProjectConfig> = if config_path.exists() {
        let content = fs::read_to_string(&config_path)
            .map_err(|e| format!("Failed to read config.json: {}", e))?;
        serde_json::from_str(&content).ok()
    } else {
        None
    };

    let config = if let Some(mut existing) = existing_config {
        existing.agent = agent;
        existing.autonomy = autonomy;
        existing
    } else {
        ProjectConfig {
            name: "Unknown".to_string(),
            description: "".to_string(),
            agent,
            autonomy,
            created_at: chrono::Utc::now().to_rfc3339(),
        }
    };

    let config_json = serde_json::to_string_pretty(&config)
        .map_err(|e| format!("Failed to serialize config: {}", e))?;

    fs::write(&config_path, config_json)
        .map_err(|e| format!("Failed to write config.json: {}", e))?;

    Ok(())
}

#[tauri::command]
fn spawn_agent(
    executable: String,
    args: Vec<String>,
    working_directory: String,
) -> Result<SpawnAgentResult, String> {
    let process_id = Uuid::new_v4().to_string();

    let child = Command::new(&executable)
        .args(&args)
        .current_dir(&working_directory)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to spawn process '{}': {}", executable, e))?;

    let mut processes = PROCESSES.lock().map_err(|e| format!("Lock error: {}", e))?;
    processes.insert(process_id.clone(), child);

    Ok(SpawnAgentResult { process_id })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            create_project,
            load_prd,
            save_prd,
            load_project_settings,
            save_project_settings,
            spawn_agent
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
