//! Git worktree management for parallel story builds.
//!
//! Each story in parallel mode gets its own git worktree to avoid file conflicts.

use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::process::Command;
use tauri::AppHandle;

/// Result of preparing a worktree for a story.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorktreeResult {
    pub worktree_path: String,
    pub branch_name: String,
}

/// Get the worktrees directory for a project.
fn get_worktrees_dir(project_path: &str) -> PathBuf {
    PathBuf::from(project_path).join(".ideate-worktrees")
}

/// Sanitize story ID for use as a branch name.
fn sanitize_branch_name(story_id: &str) -> String {
    story_id
        .chars()
        .map(|c| if c.is_alphanumeric() || c == '-' || c == '_' { c } else { '-' })
        .collect::<String>()
        .to_lowercase()
}

/// Get the current branch or HEAD ref.
fn get_base_ref(project_path: &str) -> Result<String, String> {
    let output = Command::new("git")
        .args(["rev-parse", "--abbrev-ref", "HEAD"])
        .current_dir(project_path)
        .output()
        .map_err(|e| format!("Failed to get current branch: {}", e))?;

    if !output.status.success() {
        return Err("Failed to get current branch".to_string());
    }

    let branch = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if branch == "HEAD" {
        // Detached HEAD, use commit hash
        let output = Command::new("git")
            .args(["rev-parse", "HEAD"])
            .current_dir(project_path)
            .output()
            .map_err(|e| format!("Failed to get HEAD: {}", e))?;
        Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
    } else {
        Ok(branch)
    }
}

/// Prepare a git worktree for a story.
#[tauri::command]
pub async fn prepare_story_worktree(
    _app: AppHandle,
    project_path: String,
    story_id: String,
) -> Result<WorktreeResult, String> {
    let worktrees_dir = get_worktrees_dir(&project_path);
    let branch_name = format!("story/{}", sanitize_branch_name(&story_id));
    let worktree_path = worktrees_dir.join(&sanitize_branch_name(&story_id));

    // Create worktrees directory if needed
    if !worktrees_dir.exists() {
        std::fs::create_dir_all(&worktrees_dir)
            .map_err(|e| format!("Failed to create worktrees directory: {}", e))?;
    }

    // Remove existing worktree if it exists
    if worktree_path.exists() {
        let _ = Command::new("git")
            .args(["worktree", "remove", "--force", worktree_path.to_str().unwrap()])
            .current_dir(&project_path)
            .output();
        
        // Also try to delete the directory if git worktree remove didn't work
        let _ = std::fs::remove_dir_all(&worktree_path);
    }

    // Delete existing branch if it exists
    let _ = Command::new("git")
        .args(["branch", "-D", &branch_name])
        .current_dir(&project_path)
        .output();

    // Get base ref for the new branch
    let base_ref = get_base_ref(&project_path)?;

    // Create worktree with a new branch
    let output = Command::new("git")
        .args([
            "worktree",
            "add",
            "-b",
            &branch_name,
            worktree_path.to_str().unwrap(),
            &base_ref,
        ])
        .current_dir(&project_path)
        .output()
        .map_err(|e| format!("Failed to create worktree: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Failed to create worktree: {}", stderr));
    }

    Ok(WorktreeResult {
        worktree_path: worktree_path.to_string_lossy().to_string(),
        branch_name,
    })
}

/// Finalize a story worktree after build completes.
/// If successful, commits changes and optionally merges back.
#[tauri::command]
pub async fn finalize_story_worktree(
    _app: AppHandle,
    project_path: String,
    story_id: String,
    worktree_path: String,
    branch_name: String,
    success: bool,
) -> Result<(), String> {
    let worktree = PathBuf::from(&worktree_path);

    if success && worktree.exists() {
        // Check if there are changes to commit
        let status_output = Command::new("git")
            .args(["status", "--porcelain"])
            .current_dir(&worktree_path)
            .output()
            .map_err(|e| format!("Failed to check git status: {}", e))?;

        let has_changes = !String::from_utf8_lossy(&status_output.stdout).trim().is_empty();

        if has_changes {
            // Stage all changes
            Command::new("git")
                .args(["add", "-A"])
                .current_dir(&worktree_path)
                .output()
                .map_err(|e| format!("Failed to stage changes: {}", e))?;

            // Commit changes
            let commit_message = format!("Story {}: Implementation complete", story_id);
            Command::new("git")
                .args(["commit", "-m", &commit_message])
                .current_dir(&worktree_path)
                .output()
                .map_err(|e| format!("Failed to commit: {}", e))?;

            // Merge branch back to main repo's current branch
            let base_ref = get_base_ref(&project_path)?;
            
            // First, ensure we're on the right branch in main repo
            Command::new("git")
                .args(["checkout", &base_ref])
                .current_dir(&project_path)
                .output()
                .ok();

            // Merge the story branch
            let merge_output = Command::new("git")
                .args(["merge", &branch_name, "--no-edit"])
                .current_dir(&project_path)
                .output()
                .map_err(|e| format!("Failed to merge: {}", e))?;

            if !merge_output.status.success() {
                let stderr = String::from_utf8_lossy(&merge_output.stderr);
                // If merge fails, abort it
                Command::new("git")
                    .args(["merge", "--abort"])
                    .current_dir(&project_path)
                    .output()
                    .ok();
                return Err(format!("Merge conflict, changes kept in branch {}: {}", branch_name, stderr));
            }
        }
    }

    // Remove the worktree
    if worktree.exists() {
        Command::new("git")
            .args(["worktree", "remove", "--force", &worktree_path])
            .current_dir(&project_path)
            .output()
            .ok();
        
        // Also try to delete the directory
        let _ = std::fs::remove_dir_all(&worktree_path);
    }

    // Delete the branch if it was merged or failed
    if success {
        Command::new("git")
            .args(["branch", "-d", &branch_name])
            .current_dir(&project_path)
            .output()
            .ok();
    } else {
        // Force delete on failure
        Command::new("git")
            .args(["branch", "-D", &branch_name])
            .current_dir(&project_path)
            .output()
            .ok();
    }

    Ok(())
}

/// Clean up all story worktrees for a project.
#[tauri::command]
pub async fn cleanup_all_story_worktrees(
    _app: AppHandle,
    project_path: String,
) -> Result<(), String> {
    let worktrees_dir = get_worktrees_dir(&project_path);

    if !worktrees_dir.exists() {
        return Ok(());
    }

    // List all worktrees
    let output = Command::new("git")
        .args(["worktree", "list", "--porcelain"])
        .current_dir(&project_path)
        .output()
        .map_err(|e| format!("Failed to list worktrees: {}", e))?;

    let worktree_list = String::from_utf8_lossy(&output.stdout);
    
    // Parse and remove worktrees in our directory
    for line in worktree_list.lines() {
        if line.starts_with("worktree ") {
            let path = &line[9..];
            if path.contains(".ideate-worktrees") {
                Command::new("git")
                    .args(["worktree", "remove", "--force", path])
                    .current_dir(&project_path)
                    .output()
                    .ok();
            }
        }
    }

    // Remove the worktrees directory
    let _ = std::fs::remove_dir_all(&worktrees_dir);

    // Clean up story branches
    let branch_output = Command::new("git")
        .args(["branch", "--list", "story/*"])
        .current_dir(&project_path)
        .output()
        .ok();

    if let Some(output) = branch_output {
        let branches = String::from_utf8_lossy(&output.stdout);
        for branch in branches.lines() {
            let branch = branch.trim().trim_start_matches("* ");
            if !branch.is_empty() {
                Command::new("git")
                    .args(["branch", "-D", branch])
                    .current_dir(&project_path)
                    .output()
                    .ok();
            }
        }
    }

    Ok(())
}
