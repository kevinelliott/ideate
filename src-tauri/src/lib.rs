use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

#[derive(Debug, Serialize, Deserialize)]
pub struct ProjectConfig {
    pub name: String,
    pub description: String,
    pub agent: Option<String>,
    pub autonomy: String,
    pub created_at: String,
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![create_project, load_prd])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
