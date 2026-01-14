//! Utility functions used across the application.

use regex::Regex;
use std::fs;
use std::path::PathBuf;

/// Returns the path to the .ideate directory within a project.
pub fn get_ideate_dir(project_path: &str) -> PathBuf {
    PathBuf::from(project_path).join(".ideate")
}

/// Sanitizes JSON content that may have common formatting issues from AI-generated output.
/// Handles trailing commas, single-line comments, and other common issues.
pub fn sanitize_json(content: &str) -> String {
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

/// Write binary data to a file at the specified path.
/// This bypasses the fs plugin scope restrictions for user-selected save paths.
#[tauri::command]
pub fn write_binary_file(path: String, data: Vec<u8>) -> Result<(), String> {
    fs::write(&path, &data).map_err(|e| format!("Failed to write file: {}", e))
}
