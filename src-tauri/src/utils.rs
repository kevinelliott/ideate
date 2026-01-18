//! Utility functions used across the application.

use regex::Regex;
use std::fs;
use std::path::PathBuf;

/// Returns the path to the .ideate directory within a project.
pub fn get_ideate_dir(project_path: &str) -> PathBuf {
    PathBuf::from(project_path).join(".ideate")
}

/// Sanitizes JSON content that may have common formatting issues from AI-generated output.
/// Handles trailing commas, single-line comments, control characters, and other common issues.
pub fn sanitize_json(content: &str) -> String {
    let mut result = content.to_string();
    
    // Remove control characters (except for valid whitespace: \t, \n, \r)
    // These can appear in AI-generated content and break JSON parsing
    result = result.chars().filter(|c| {
        !c.is_control() || *c == '\t' || *c == '\n' || *c == '\r'
    }).collect();
    
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

/// Write binary data to a file at the specified path.
/// This bypasses the fs plugin scope restrictions for user-selected save paths.
#[tauri::command]
pub fn write_binary_file(path: String, data: Vec<u8>) -> Result<(), String> {
    fs::write(&path, &data).map_err(|e| format!("Failed to write file: {}", e))
}

/// Represents a file or directory entry in the file tree.
#[derive(serde::Serialize)]
pub struct FileEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub children: Option<Vec<FileEntry>>,
}

/// List files in a project directory, filtering out common ignored directories.
#[tauri::command(rename_all = "camelCase")]
pub fn list_project_files(project_path: String, max_depth: Option<u32>) -> Result<Vec<FileEntry>, String> {
    let path = PathBuf::from(&project_path);
    if !path.exists() {
        return Err("Project path does not exist".to_string());
    }
    
    let depth = max_depth.unwrap_or(10);
    list_files_recursive(&path, &path, 0, depth)
}

fn list_files_recursive(
    base_path: &PathBuf,
    current_path: &PathBuf,
    current_depth: u32,
    max_depth: u32,
) -> Result<Vec<FileEntry>, String> {
    if current_depth > max_depth {
        return Ok(Vec::new());
    }
    
    let ignored = [
        "node_modules", ".git", ".svn", ".hg", "target", "dist", "build",
        ".next", ".nuxt", ".output", "__pycache__", ".pytest_cache",
        "venv", ".venv", "env", ".env", ".DS_Store", ".ideate", ".vite",
        "coverage", ".nyc_output", ".turbo", ".vercel", ".netlify",
    ];
    
    let mut entries: Vec<FileEntry> = Vec::new();
    
    let dir_entries = fs::read_dir(current_path)
        .map_err(|e| format!("Failed to read directory: {}", e))?;
    
    let mut items: Vec<_> = dir_entries
        .filter_map(|e| e.ok())
        .filter(|entry| {
            let name = entry.file_name().to_string_lossy().to_string();
            !ignored.contains(&name.as_str()) && !name.starts_with('.')
        })
        .collect();
    
    items.sort_by(|a, b| {
        let a_is_dir = a.file_type().map(|t| t.is_dir()).unwrap_or(false);
        let b_is_dir = b.file_type().map(|t| t.is_dir()).unwrap_or(false);
        match (a_is_dir, b_is_dir) {
            (true, false) => std::cmp::Ordering::Less,
            (false, true) => std::cmp::Ordering::Greater,
            _ => a.file_name().cmp(&b.file_name()),
        }
    });
    
    for item in items {
        let name = item.file_name().to_string_lossy().to_string();
        let path = item.path();
        let is_dir = item.file_type().map(|t| t.is_dir()).unwrap_or(false);
        let relative_path = path.strip_prefix(base_path)
            .map(|p| p.to_string_lossy().to_string())
            .unwrap_or_else(|_| path.to_string_lossy().to_string());
        
        let children = if is_dir {
            Some(list_files_recursive(base_path, &path, current_depth + 1, max_depth)?)
        } else {
            None
        };
        
        entries.push(FileEntry {
            name,
            path: relative_path,
            is_dir,
            children,
        });
    }
    
    Ok(entries)
}

/// Read the contents of a file.
#[tauri::command(rename_all = "camelCase")]
pub fn read_project_file(project_path: String, relative_path: String) -> Result<String, String> {
    let full_path = PathBuf::from(&project_path).join(&relative_path);
    
    if !full_path.exists() {
        return Err("File does not exist".to_string());
    }
    
    if !full_path.is_file() {
        return Err("Path is not a file".to_string());
    }
    
    let metadata = fs::metadata(&full_path)
        .map_err(|e| format!("Failed to get file metadata: {}", e))?;
    
    if metadata.len() > 1024 * 1024 {
        return Err("File too large (>1MB)".to_string());
    }
    
    fs::read_to_string(&full_path)
        .map_err(|e| format!("Failed to read file: {}", e))
}
