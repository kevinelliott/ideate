//! Project, PRD, and state management commands.

use std::fs;
use std::path::PathBuf;
use std::process::Command;
use tauri::{AppHandle, Manager};

use crate::models::{
    CostHistory, CreateProjectResult, Design, Prd, ProjectConfig, ProjectIdea, ProjectSettings,
    ProjectState, StoredProject,
};
use crate::utils::{get_ideate_dir, sanitize_json};

// ============================================================================
// Project Management
// ============================================================================

/// Creates a new project with the given name and description.
#[tauri::command(rename_all = "camelCase")]
pub fn create_project(
    name: String,
    description: String,
    parent_path: String,
) -> Result<CreateProjectResult, String> {
    let project_dir = PathBuf::from(&parent_path).join(&name);
    
    if project_dir.exists() {
        return Err(format!(
            "Directory '{}' already exists",
            project_dir.display()
        ));
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
    
    // Initialize git repository
    Command::new("git")
        .args(["init"])
        .current_dir(&project_dir)
        .output()
        .map_err(|e| format!("Failed to initialize git repository: {}", e))?;
    
    // Create .gitignore with common patterns
    let gitignore_content = r#"# Dependencies
node_modules/
.pnpm-store/

# Build outputs
dist/
build/
target/

# IDE
.idea/
.vscode/
*.swp
*.swo
.DS_Store

# Environment
.env
.env.local
.env.*.local

# Logs
*.log
npm-debug.log*
"#;
    fs::write(project_dir.join(".gitignore"), gitignore_content)
        .map_err(|e| format!("Failed to create .gitignore: {}", e))?;
    
    // Stage and create initial commit (required for git worktrees)
    Command::new("git")
        .args(["add", "-A"])
        .current_dir(&project_dir)
        .output()
        .map_err(|e| format!("Failed to stage files: {}", e))?;
    
    // Try to commit - this may fail if git user is not configured, which is okay
    // The user can commit manually later
    let commit_result = Command::new("git")
        .args(["commit", "-m", "Initial commit"])
        .current_dir(&project_dir)
        .output();
    
    if let Err(e) = commit_result {
        eprintln!("Warning: Could not create initial commit: {}. Git user may not be configured.", e);
    } else if let Ok(output) = commit_result {
        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            eprintln!("Warning: Initial commit failed: {}", stderr);
        }
    }
    
    Ok(CreateProjectResult {
        path: project_dir.to_string_lossy().to_string(),
        config_path: config_path.to_string_lossy().to_string(),
    })
}

/// Imports an existing directory as a project.
#[tauri::command(rename_all = "camelCase")]
pub fn import_project(name: String, project_path: String) -> Result<CreateProjectResult, String> {
    let project_dir = PathBuf::from(&project_path);
    
    if !project_dir.exists() {
        return Err(format!("Directory '{}' does not exist", project_path));
    }
    
    let ideate_dir = project_dir.join(".ideate");
    if !ideate_dir.exists() {
        fs::create_dir_all(&ideate_dir)
            .map_err(|e| format!("Failed to create .ideate directory: {}", e))?;
    }
    
    let config_path = ideate_dir.join("config.json");
    
    if !config_path.exists() {
        // Use provided name, or fall back to directory name
        let project_name = if name.is_empty() {
            project_dir
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or("Imported Project")
                .to_string()
        } else {
            name
        };
        
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

/// Loads the list of projects from the app data directory.
#[tauri::command]
pub fn load_projects(app: AppHandle) -> Result<Vec<StoredProject>, String> {
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

/// Saves the list of projects to the app data directory.
#[tauri::command]
pub fn save_projects(app: AppHandle, projects: Vec<StoredProject>) -> Result<(), String> {
    let projects_path = get_projects_file_path(&app)?;
    
    let projects_json = serde_json::to_string_pretty(&projects)
        .map_err(|e| format!("Failed to serialize projects: {}", e))?;
    
    fs::write(&projects_path, projects_json)
        .map_err(|e| format!("Failed to write projects.json: {}", e))?;
    
    Ok(())
}

// ============================================================================
// PRD Management
// ============================================================================

/// Loads the PRD (Product Requirements Document) for a project.
#[tauri::command(rename_all = "camelCase")]
pub fn load_prd(project_path: String) -> Result<Option<Prd>, String> {
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

/// Saves the PRD for a project.
#[tauri::command(rename_all = "camelCase")]
pub fn save_prd(project_path: String, prd: Prd) -> Result<(), String> {
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

// ============================================================================
// Project Idea Management
// ============================================================================

/// Loads the project idea from .ideate/idea.json
#[tauri::command(rename_all = "camelCase")]
pub fn load_project_idea(project_path: String) -> Result<Option<ProjectIdea>, String> {
    let idea_path = get_ideate_dir(&project_path).join("idea.json");
    
    if !idea_path.exists() {
        return Ok(None);
    }
    
    let content = fs::read_to_string(&idea_path)
        .map_err(|e| format!("Failed to read idea.json: {}", e))?;
    
    let idea: ProjectIdea = serde_json::from_str(&content)
        .map_err(|e| format!("Failed to parse idea.json: {}", e))?;
    
    Ok(Some(idea))
}

/// Saves the project idea to .ideate/idea.json
#[tauri::command(rename_all = "camelCase")]
pub fn save_project_idea(project_path: String, idea: ProjectIdea) -> Result<(), String> {
    let ideate_dir = get_ideate_dir(&project_path);
    
    if !ideate_dir.exists() {
        fs::create_dir_all(&ideate_dir)
            .map_err(|e| format!("Failed to create .ideate directory: {}", e))?;
    }
    
    let idea_path = ideate_dir.join("idea.json");
    
    let idea_json = serde_json::to_string_pretty(&idea)
        .map_err(|e| format!("Failed to serialize idea: {}", e))?;
    
    fs::write(&idea_path, idea_json)
        .map_err(|e| format!("Failed to write idea.json: {}", e))?;
    
    Ok(())
}

// ============================================================================
// Design Document Management
// ============================================================================

/// Loads the Design document for a project.
#[tauri::command(rename_all = "camelCase")]
pub fn load_design(project_path: String) -> Result<Option<Design>, String> {
    let design_path = get_ideate_dir(&project_path).join("design.json");
    
    if !design_path.exists() {
        return Ok(None);
    }
    
    let content = fs::read_to_string(&design_path)
        .map_err(|e| format!("Failed to read design.json: {}", e))?;
    
    // Sanitize the JSON before parsing (handles trailing commas, comments, etc.)
    let sanitized = sanitize_json(&content);
    
    let design: Design = serde_json::from_str(&sanitized)
        .map_err(|e| format!("Failed to parse design.json: {}", e))?;
    
    Ok(Some(design))
}

/// Saves the Design document for a project.
#[tauri::command(rename_all = "camelCase")]
pub fn save_design(project_path: String, design: Design) -> Result<(), String> {
    let ideate_dir = get_ideate_dir(&project_path);
    
    if !ideate_dir.exists() {
        fs::create_dir_all(&ideate_dir)
            .map_err(|e| format!("Failed to create .ideate directory: {}", e))?;
    }
    
    let design_path = ideate_dir.join("design.json");
    
    let design_json = serde_json::to_string_pretty(&design)
        .map_err(|e| format!("Failed to serialize Design: {}", e))?;
    
    fs::write(&design_path, design_json)
        .map_err(|e| format!("Failed to write design.json: {}", e))?;
    
    Ok(())
}

// ============================================================================
// Utility Commands
// ============================================================================

/// Deletes a project directory and all its contents.
#[tauri::command(rename_all = "camelCase")]
pub fn delete_project_directory(path: String) -> Result<(), String> {
    let project_dir = PathBuf::from(&path);
    
    if !project_dir.exists() {
        return Err(format!("Directory '{}' does not exist", path));
    }
    
    if !project_dir.is_dir() {
        return Err(format!("'{}' is not a directory", path));
    }
    
    fs::remove_dir_all(&project_dir)
        .map_err(|e| format!("Failed to delete directory '{}': {}", path, e))?;
    
    Ok(())
}

/// Lists files in a directory (non-recursive).
#[tauri::command(rename_all = "camelCase")]
pub fn list_directory(path: String) -> Result<Vec<String>, String> {
    let dir = PathBuf::from(&path);
    
    if !dir.exists() {
        return Err(format!("Directory '{}' does not exist", path));
    }
    
    if !dir.is_dir() {
        return Err(format!("'{}' is not a directory", path));
    }
    
    let mut files = Vec::new();
    
    for entry in fs::read_dir(&dir).map_err(|e| format!("Failed to read directory: {}", e))? {
        let entry = entry.map_err(|e| format!("Failed to read entry: {}", e))?;
        if let Some(name) = entry.file_name().to_str() {
            files.push(name.to_string());
        }
    }
    
    files.sort();
    Ok(files)
}

/// Checks if a directory exists at the given path.
#[tauri::command(rename_all = "camelCase")]
pub fn check_directory_exists(path: String) -> Result<bool, String> {
    let path = PathBuf::from(&path);
    Ok(path.exists() && path.is_dir())
}

/// Checks if a command exists in the system PATH.
#[tauri::command(rename_all = "camelCase")]
pub fn check_command_exists(command: String) -> Result<bool, String> {
    let result = Command::new("which")
        .arg(&command)
        .output();
    
    match result {
        Ok(output) => Ok(output.status.success()),
        Err(_) => {
            // Fallback for Windows
            let result = Command::new("where")
                .arg(&command)
                .output();
            
            match result {
                Ok(output) => Ok(output.status.success()),
                Err(_) => Ok(false),
            }
        }
    }
}

// ============================================================================
// Project Settings
// ============================================================================

/// Loads project-specific settings.
#[tauri::command(rename_all = "camelCase")]
pub fn load_project_settings(project_path: String) -> Result<Option<ProjectSettings>, String> {
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

/// Saves project-specific settings.
#[tauri::command(rename_all = "camelCase")]
pub fn save_project_settings(
    project_path: String,
    settings: ProjectSettings,
) -> Result<(), String> {
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

// ============================================================================
// Project State
// ============================================================================

/// Loads the build state for a project.
#[tauri::command(rename_all = "camelCase")]
pub fn load_project_state(project_path: String) -> Result<Option<ProjectState>, String> {
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

/// Saves the build state for a project.
#[tauri::command(rename_all = "camelCase")]
pub fn save_project_state(project_path: String, state: ProjectState) -> Result<(), String> {
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

// ============================================================================
// Cost History
// ============================================================================

/// Loads the cost history for a project.
#[tauri::command(rename_all = "camelCase")]
pub fn load_cost_history(project_path: String) -> Result<CostHistory, String> {
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

/// Saves the cost history for a project.
#[tauri::command(rename_all = "camelCase")]
pub fn save_cost_history(project_path: String, history: CostHistory) -> Result<(), String> {
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
