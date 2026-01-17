//! Git worktree management for parallel story builds.
//!
//! Each story in parallel mode gets its own git worktree to avoid file conflicts.
//! Also provides snapshot/rollback functionality for undo on build failures.

use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::process::Command;
use tauri::AppHandle;

/// Result of creating a story snapshot.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SnapshotResult {
    pub snapshot_ref: String,
    pub snapshot_type: String, // "stash" or "commit"
}

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
    // First check if there are any commits
    let rev_output = Command::new("git")
        .args(["rev-parse", "HEAD"])
        .current_dir(project_path)
        .output()
        .map_err(|e| format!("Failed to run git rev-parse: {}", e))?;

    if !rev_output.status.success() {
        let stderr = String::from_utf8_lossy(&rev_output.stderr);
        if stderr.contains("unknown revision") || stderr.contains("bad revision") {
            return Err("No commits in repository. Please create an initial commit first.".to_string());
        }
        return Err(format!("Failed to get HEAD: {}", stderr.trim()));
    }

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
        Ok(String::from_utf8_lossy(&rev_output.stdout).trim().to_string())
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

/// Information about a story branch.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StoryBranchInfo {
    pub branch_name: String,
    pub story_id: String,
    pub status: String, // "merged", "unmerged", "conflicted"
    pub is_current: bool,
}

/// List all story branches for a project.
#[tauri::command]
pub async fn list_story_branches(
    _app: AppHandle,
    project_path: String,
) -> Result<Vec<StoryBranchInfo>, String> {
    let output = Command::new("git")
        .args(["branch", "--list", "story/*"])
        .current_dir(&project_path)
        .output()
        .map_err(|e| format!("Failed to list branches: {}", e))?;

    if !output.status.success() {
        return Ok(vec![]);
    }

    let branches_output = String::from_utf8_lossy(&output.stdout);
    let mut branches = Vec::new();

    // Get current branch
    let current_output = Command::new("git")
        .args(["rev-parse", "--abbrev-ref", "HEAD"])
        .current_dir(&project_path)
        .output()
        .ok();
    let current_branch = current_output
        .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
        .unwrap_or_default();

    // Get main/master branch name
    let main_branch = get_main_branch(&project_path);

    for line in branches_output.lines() {
        // Git uses "* " for current branch and "+ " for worktree branches
        let branch = line.trim()
            .trim_start_matches("* ")
            .trim_start_matches("+ ")
            .to_string();
        if branch.is_empty() {
            continue;
        }

        let story_id = branch.strip_prefix("story/").unwrap_or(&branch).to_string();
        let is_current = branch == current_branch;

        // Check if branch is merged into main
        let merged_output = Command::new("git")
            .args(["branch", "--merged", &main_branch])
            .current_dir(&project_path)
            .output()
            .ok();

        let is_merged = merged_output
            .map(|o| {
                String::from_utf8_lossy(&o.stdout)
                    .lines()
                    .any(|l| l.trim().trim_start_matches("* ") == branch)
            })
            .unwrap_or(false);

        // Check for conflicts by attempting a dry-run merge
        let status = if is_merged {
            "merged".to_string()
        } else {
            // Check if there would be conflicts
            let merge_base = Command::new("git")
                .args(["merge-base", &main_branch, &branch])
                .current_dir(&project_path)
                .output()
                .ok();

            if let Some(base_output) = merge_base {
                if base_output.status.success() {
                    let base = String::from_utf8_lossy(&base_output.stdout).trim().to_string();
                    let merge_tree = Command::new("git")
                        .args(["merge-tree", &base, &main_branch, &branch])
                        .current_dir(&project_path)
                        .output()
                        .ok();

                    if let Some(tree_output) = merge_tree {
                        let tree_result = String::from_utf8_lossy(&tree_output.stdout);
                        if tree_result.contains("<<<<<<") || tree_result.contains("changed in both") {
                            "conflicted".to_string()
                        } else {
                            "unmerged".to_string()
                        }
                    } else {
                        "unmerged".to_string()
                    }
                } else {
                    "unmerged".to_string()
                }
            } else {
                "unmerged".to_string()
            }
        };

        branches.push(StoryBranchInfo {
            branch_name: branch,
            story_id,
            status,
            is_current,
        });
    }

    Ok(branches)
}

/// Get the main branch name (main or master).
fn get_main_branch(project_path: &str) -> String {
    let output = Command::new("git")
        .args(["rev-parse", "--verify", "main"])
        .current_dir(project_path)
        .output()
        .ok();

    if let Some(o) = output {
        if o.status.success() {
            return "main".to_string();
        }
    }

    "master".to_string()
}

/// Delete a story branch.
#[tauri::command]
pub async fn delete_story_branch(
    _app: AppHandle,
    project_path: String,
    branch_name: String,
    force: bool,
) -> Result<(), String> {
    // First, check if there's a worktree using this branch and remove it
    let worktree_list = Command::new("git")
        .args(["worktree", "list", "--porcelain"])
        .current_dir(&project_path)
        .output()
        .ok();

    if let Some(output) = worktree_list {
        let list_str = String::from_utf8_lossy(&output.stdout);
        let mut current_worktree: Option<String> = None;
        
        for line in list_str.lines() {
            if line.starts_with("worktree ") {
                current_worktree = Some(line[9..].to_string());
            } else if line.starts_with("branch ") {
                let branch = line[7..].trim();
                // Check if this worktree is using our branch (refs/heads/story/...)
                if branch.ends_with(&branch_name) || branch == format!("refs/heads/{}", branch_name) {
                    if let Some(ref wt_path) = current_worktree {
                        // Remove the worktree first
                        Command::new("git")
                            .args(["worktree", "remove", "--force", wt_path])
                            .current_dir(&project_path)
                            .output()
                            .ok();
                        
                        // Also try to delete the directory if git worktree remove didn't work
                        let _ = std::fs::remove_dir_all(wt_path);
                    }
                }
            }
        }
    }

    // Now delete the branch
    let flag = if force { "-D" } else { "-d" };
    let output = Command::new("git")
        .args(["branch", flag, &branch_name])
        .current_dir(&project_path)
        .output()
        .map_err(|e| format!("Failed to delete branch: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Failed to delete branch: {}", stderr));
    }

    Ok(())
}

/// Checkout a story branch.
#[tauri::command]
pub async fn checkout_story_branch(
    _app: AppHandle,
    project_path: String,
    branch_name: String,
) -> Result<(), String> {
    // Abort any pending merge first
    let _ = Command::new("git")
        .args(["merge", "--abort"])
        .current_dir(&project_path)
        .output();

    // Reset any staged changes that might block checkout
    let _ = Command::new("git")
        .args(["reset", "--hard", "HEAD"])
        .current_dir(&project_path)
        .output();

    let output = Command::new("git")
        .args(["checkout", &branch_name])
        .current_dir(&project_path)
        .output()
        .map_err(|e| format!("Failed to checkout branch: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Failed to checkout branch: {}", stderr));
    }

    Ok(())
}

/// Force merge a story branch into the current branch.
#[tauri::command]
pub async fn force_merge_story_branch(
    _app: AppHandle,
    project_path: String,
    branch_name: String,
) -> Result<(), String> {
    // First try normal merge
    let output = Command::new("git")
        .args(["merge", &branch_name, "--no-edit"])
        .current_dir(&project_path)
        .output()
        .map_err(|e| format!("Failed to merge: {}", e))?;

    if output.status.success() {
        return Ok(());
    }

    // If conflicts, force accept theirs
    let _ = Command::new("git")
        .args(["merge", "--abort"])
        .current_dir(&project_path)
        .output();

    let output = Command::new("git")
        .args(["merge", &branch_name, "-X", "theirs", "--no-edit"])
        .current_dir(&project_path)
        .output()
        .map_err(|e| format!("Failed to force merge: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Failed to force merge: {}", stderr));
    }

    Ok(())
}

/// Information about a file change in a diff.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileDiff {
    pub file_path: String,
    pub diff_content: String,
    pub additions: u32,
    pub deletions: u32,
    pub status: String, // "added", "modified", "deleted", "renamed"
}

/// Result of getting diff for a story branch.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StoryDiffResult {
    pub story_id: String,
    pub branch_name: String,
    pub files: Vec<FileDiff>,
    pub total_additions: u32,
    pub total_deletions: u32,
}

/// Get the diff for a story branch compared to main.
#[tauri::command]
pub async fn get_story_diff(
    _app: AppHandle,
    project_path: String,
    story_id: String,
    branch_name: Option<String>,
) -> Result<StoryDiffResult, String> {
    // Use provided branch name, or construct from story ID
    let branch_name = branch_name.unwrap_or_else(|| {
        format!("story/{}", sanitize_branch_name(&story_id))
    });
    let main_branch = get_main_branch(&project_path);

    // Verify the branch exists first
    let branch_check = Command::new("git")
        .args(["rev-parse", "--verify", &branch_name])
        .current_dir(&project_path)
        .output()
        .map_err(|e| format!("Failed to verify branch: {}", e))?;

    if !branch_check.status.success() {
        return Err(format!(
            "Branch '{}' not found. The story branch may have been deleted or merged.",
            branch_name
        ));
    }

    // Get the merge base between main and the story branch
    let merge_base_output = Command::new("git")
        .args(["merge-base", &main_branch, &branch_name])
        .current_dir(&project_path)
        .output()
        .map_err(|e| format!("Failed to get merge base: {}", e))?;

    if !merge_base_output.status.success() {
        return Err(format!(
            "Branch {} has no common ancestor with {}",
            branch_name, main_branch
        ));
    }

    let merge_base = String::from_utf8_lossy(&merge_base_output.stdout)
        .trim()
        .to_string();

    // Get list of changed files with stats
    let diff_stat_output = Command::new("git")
        .args(["diff", "--numstat", &merge_base, &branch_name])
        .current_dir(&project_path)
        .output()
        .map_err(|e| format!("Failed to get diff stats: {}", e))?;

    if !diff_stat_output.status.success() {
        return Err("Failed to get diff stats".to_string());
    }

    // Get the diff name-status for file status (added, modified, deleted, renamed)
    let name_status_output = Command::new("git")
        .args(["diff", "--name-status", &merge_base, &branch_name])
        .current_dir(&project_path)
        .output()
        .map_err(|e| format!("Failed to get name status: {}", e))?;

    let name_status_str = String::from_utf8_lossy(&name_status_output.stdout);
    let mut file_statuses: std::collections::HashMap<String, String> =
        std::collections::HashMap::new();

    for line in name_status_str.lines() {
        let parts: Vec<&str> = line.split('\t').collect();
        if parts.len() >= 2 {
            let status = match parts[0].chars().next() {
                Some('A') => "added",
                Some('M') => "modified",
                Some('D') => "deleted",
                Some('R') => "renamed",
                Some('C') => "copied",
                _ => "modified",
            };
            // For renamed files, use the new name
            let file_path = if parts.len() >= 3 {
                parts[2]
            } else {
                parts[1]
            };
            file_statuses.insert(file_path.to_string(), status.to_string());
        }
    }

    let diff_stat_str = String::from_utf8_lossy(&diff_stat_output.stdout);
    let mut files = Vec::new();
    let mut total_additions: u32 = 0;
    let mut total_deletions: u32 = 0;

    for line in diff_stat_str.lines() {
        let parts: Vec<&str> = line.split('\t').collect();
        if parts.len() >= 3 {
            let additions: u32 = parts[0].parse().unwrap_or(0);
            let deletions: u32 = parts[1].parse().unwrap_or(0);
            let file_path = parts[2].to_string();

            // Get the diff content for this specific file
            let file_diff_output = Command::new("git")
                .args(["diff", &merge_base, &branch_name, "--", &file_path])
                .current_dir(&project_path)
                .output()
                .ok();

            let diff_content = file_diff_output
                .map(|o| String::from_utf8_lossy(&o.stdout).to_string())
                .unwrap_or_default();

            let status = file_statuses
                .get(&file_path)
                .cloned()
                .unwrap_or_else(|| "modified".to_string());

            total_additions += additions;
            total_deletions += deletions;

            files.push(FileDiff {
                file_path,
                diff_content,
                additions,
                deletions,
                status,
            });
        }
    }

    Ok(StoryDiffResult {
        story_id,
        branch_name,
        files,
        total_additions,
        total_deletions,
    })
}

/// Create a snapshot of the current state before running a story.
/// Uses git stash if there are uncommitted changes, otherwise creates a lightweight marker.
#[tauri::command]
pub async fn create_story_snapshot(
    _app: AppHandle,
    project_path: String,
    story_id: String,
) -> Result<SnapshotResult, String> {
    // Check if there are uncommitted changes
    let status_output = Command::new("git")
        .args(["status", "--porcelain"])
        .current_dir(&project_path)
        .output()
        .map_err(|e| format!("Failed to check git status: {}", e))?;

    let has_changes = !String::from_utf8_lossy(&status_output.stdout).trim().is_empty();

    if has_changes {
        // Create a stash with a unique message
        let stash_message = format!("ideate-snapshot-{}", story_id);
        let output = Command::new("git")
            .args(["stash", "push", "-m", &stash_message, "--include-untracked"])
            .current_dir(&project_path)
            .output()
            .map_err(|e| format!("Failed to create stash: {}", e))?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(format!("Failed to create stash: {}", stderr));
        }

        // Apply the stash immediately to restore working state (but keep the stash)
        Command::new("git")
            .args(["stash", "apply"])
            .current_dir(&project_path)
            .output()
            .ok();

        Ok(SnapshotResult {
            snapshot_ref: stash_message,
            snapshot_type: "stash".to_string(),
        })
    } else {
        // No uncommitted changes - record current HEAD as the snapshot
        let output = Command::new("git")
            .args(["rev-parse", "HEAD"])
            .current_dir(&project_path)
            .output()
            .map_err(|e| format!("Failed to get HEAD: {}", e))?;

        if !output.status.success() {
            return Err("Failed to get HEAD commit".to_string());
        }

        let commit_ref = String::from_utf8_lossy(&output.stdout).trim().to_string();
        Ok(SnapshotResult {
            snapshot_ref: commit_ref,
            snapshot_type: "commit".to_string(),
        })
    }
}

/// Rollback to a story snapshot, discarding all changes made since.
#[tauri::command]
pub async fn rollback_story_changes(
    _app: AppHandle,
    project_path: String,
    snapshot_ref: String,
    snapshot_type: String,
) -> Result<(), String> {
    if snapshot_type == "stash" {
        // First, discard all current changes
        Command::new("git")
            .args(["reset", "--hard", "HEAD"])
            .current_dir(&project_path)
            .output()
            .map_err(|e| format!("Failed to reset: {}", e))?;

        // Clean untracked files
        Command::new("git")
            .args(["clean", "-fd"])
            .current_dir(&project_path)
            .output()
            .ok();

        // Find and apply the stash
        let list_output = Command::new("git")
            .args(["stash", "list"])
            .current_dir(&project_path)
            .output()
            .map_err(|e| format!("Failed to list stashes: {}", e))?;

        let stash_list = String::from_utf8_lossy(&list_output.stdout);
        let mut stash_index: Option<usize> = None;

        for (idx, line) in stash_list.lines().enumerate() {
            if line.contains(&snapshot_ref) {
                stash_index = Some(idx);
                break;
            }
        }

        if let Some(idx) = stash_index {
            let stash_ref = format!("stash@{{{}}}", idx);
            
            // Pop the stash to restore original state
            let output = Command::new("git")
                .args(["stash", "pop", &stash_ref])
                .current_dir(&project_path)
                .output()
                .map_err(|e| format!("Failed to pop stash: {}", e))?;

            if !output.status.success() {
                let stderr = String::from_utf8_lossy(&output.stderr);
                return Err(format!("Failed to restore from stash: {}", stderr));
            }
        }
    } else {
        // Commit-based snapshot - reset to that commit
        let output = Command::new("git")
            .args(["reset", "--hard", &snapshot_ref])
            .current_dir(&project_path)
            .output()
            .map_err(|e| format!("Failed to reset to snapshot: {}", e))?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(format!("Failed to reset to snapshot: {}", stderr));
        }

        // Clean untracked files
        Command::new("git")
            .args(["clean", "-fd"])
            .current_dir(&project_path)
            .output()
            .ok();
    }

    Ok(())
}

/// Discard a story snapshot after successful completion.
#[tauri::command]
pub async fn discard_story_snapshot(
    _app: AppHandle,
    project_path: String,
    snapshot_ref: String,
    snapshot_type: String,
) -> Result<(), String> {
    if snapshot_type == "stash" {
        // Find and drop the stash
        let list_output = Command::new("git")
            .args(["stash", "list"])
            .current_dir(&project_path)
            .output()
            .map_err(|e| format!("Failed to list stashes: {}", e))?;

        let stash_list = String::from_utf8_lossy(&list_output.stdout);
        
        for (idx, line) in stash_list.lines().enumerate() {
            if line.contains(&snapshot_ref) {
                let stash_ref = format!("stash@{{{}}}", idx);
                Command::new("git")
                    .args(["stash", "drop", &stash_ref])
                    .current_dir(&project_path)
                    .output()
                    .ok();
                break;
            }
        }
    }
    // For commit-based snapshots, nothing to clean up
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

/// Information about a conflicting file in a merge.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConflictFileInfo {
    pub file_path: String,
    pub ours_content: String,
    pub theirs_content: String,
    pub base_content: String,
}

/// Result of analyzing merge conflicts.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MergeConflictAnalysis {
    pub branch_name: String,
    pub conflicting_files: Vec<ConflictFileInfo>,
    pub non_conflicting_count: u32,
}

/// Analyze what conflicts would occur when merging a story branch.
#[tauri::command]
pub async fn analyze_merge_conflicts(
    _app: AppHandle,
    project_path: String,
    branch_name: String,
) -> Result<MergeConflictAnalysis, String> {
    let main_branch = get_main_branch(&project_path);

    // Get merge base
    let merge_base_output = Command::new("git")
        .args(["merge-base", &main_branch, &branch_name])
        .current_dir(&project_path)
        .output()
        .map_err(|e| format!("Failed to get merge base: {}", e))?;

    if !merge_base_output.status.success() {
        return Err(format!("Cannot find common ancestor between {} and {}", main_branch, branch_name));
    }

    let base_commit = String::from_utf8_lossy(&merge_base_output.stdout).trim().to_string();

    // Get list of files changed in the story branch
    let branch_files_output = Command::new("git")
        .args(["diff", "--name-only", &base_commit, &branch_name])
        .current_dir(&project_path)
        .output()
        .map_err(|e| format!("Failed to get branch files: {}", e))?;

    let branch_files: Vec<String> = String::from_utf8_lossy(&branch_files_output.stdout)
        .lines()
        .map(|s| s.to_string())
        .collect();

    // Get list of files changed in main since the base
    let main_files_output = Command::new("git")
        .args(["diff", "--name-only", &base_commit, &main_branch])
        .current_dir(&project_path)
        .output()
        .map_err(|e| format!("Failed to get main files: {}", e))?;

    let main_files: std::collections::HashSet<String> = String::from_utf8_lossy(&main_files_output.stdout)
        .lines()
        .map(|s| s.to_string())
        .collect();

    // Find files changed in both
    let mut conflicting_files = Vec::new();
    let mut non_conflicting_count = 0u32;

    for file_path in &branch_files {
        if main_files.contains(file_path) {
            // This file was changed in both branches - potential conflict
            // Get content from each version
            let base_content = get_file_at_ref(&project_path, &base_commit, file_path);
            let ours_content = get_file_at_ref(&project_path, &main_branch, file_path);
            let theirs_content = get_file_at_ref(&project_path, &branch_name, file_path);

            conflicting_files.push(ConflictFileInfo {
                file_path: file_path.clone(),
                ours_content,
                theirs_content,
                base_content,
            });
        } else {
            non_conflicting_count += 1;
        }
    }

    Ok(MergeConflictAnalysis {
        branch_name,
        conflicting_files,
        non_conflicting_count,
    })
}

/// Get file content at a specific git ref.
fn get_file_at_ref(project_path: &str, git_ref: &str, file_path: &str) -> String {
    let output = Command::new("git")
        .args(["show", &format!("{}:{}", git_ref, file_path)])
        .current_dir(project_path)
        .output()
        .ok();

    output
        .filter(|o| o.status.success())
        .map(|o| String::from_utf8_lossy(&o.stdout).to_string())
        .unwrap_or_default()
}

/// Resolution strategy for a conflicting file.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileResolution {
    pub file_path: String,
    pub strategy: String, // "ours", "theirs", "both"
}

/// Merge a story branch with specific resolutions for conflicting files.
#[tauri::command]
pub async fn merge_with_resolutions(
    _app: AppHandle,
    project_path: String,
    branch_name: String,
    resolutions: Vec<FileResolution>,
) -> Result<(), String> {
    // Start the merge (will likely have conflicts)
    let merge_output = Command::new("git")
        .args(["merge", &branch_name, "--no-commit", "--no-ff"])
        .current_dir(&project_path)
        .output()
        .map_err(|e| format!("Failed to start merge: {}", e))?;

    // If merge succeeded without conflicts, commit and return
    if merge_output.status.success() {
        Command::new("git")
            .args(["commit", "-m", &format!("Merge branch '{}'", branch_name)])
            .current_dir(&project_path)
            .output()
            .map_err(|e| format!("Failed to commit merge: {}", e))?;
        return Ok(());
    }

    // Apply resolutions for each file
    for resolution in &resolutions {
        match resolution.strategy.as_str() {
            "ours" => {
                // Keep our version
                Command::new("git")
                    .args(["checkout", "--ours", &resolution.file_path])
                    .current_dir(&project_path)
                    .output()
                    .map_err(|e| format!("Failed to checkout ours for {}: {}", resolution.file_path, e))?;
            }
            "theirs" => {
                // Keep their version
                Command::new("git")
                    .args(["checkout", "--theirs", &resolution.file_path])
                    .current_dir(&project_path)
                    .output()
                    .map_err(|e| format!("Failed to checkout theirs for {}: {}", resolution.file_path, e))?;
            }
            "both" => {
                // Concatenate both versions (theirs after ours)
                let ours_output = Command::new("git")
                    .args(["show", &format!("HEAD:{}", resolution.file_path)])
                    .current_dir(&project_path)
                    .output()
                    .ok();
                
                let theirs_output = Command::new("git")
                    .args(["show", &format!("{}:{}", branch_name, resolution.file_path)])
                    .current_dir(&project_path)
                    .output()
                    .ok();

                let ours_content = ours_output
                    .filter(|o| o.status.success())
                    .map(|o| String::from_utf8_lossy(&o.stdout).to_string())
                    .unwrap_or_default();

                let theirs_content = theirs_output
                    .filter(|o| o.status.success())
                    .map(|o| String::from_utf8_lossy(&o.stdout).to_string())
                    .unwrap_or_default();

                // Write combined content
                let file_path = PathBuf::from(&project_path).join(&resolution.file_path);
                std::fs::write(&file_path, format!("{}\n{}", ours_content.trim_end(), theirs_content))
                    .map_err(|e| format!("Failed to write combined file: {}", e))?;
            }
            _ => {
                return Err(format!("Unknown resolution strategy: {}", resolution.strategy));
            }
        }

        // Stage the resolved file
        Command::new("git")
            .args(["add", &resolution.file_path])
            .current_dir(&project_path)
            .output()
            .map_err(|e| format!("Failed to stage {}: {}", resolution.file_path, e))?;
    }

    // Commit the merge
    let commit_output = Command::new("git")
        .args(["commit", "-m", &format!("Merge branch '{}' with custom resolutions", branch_name)])
        .current_dir(&project_path)
        .output()
        .map_err(|e| format!("Failed to commit merge: {}", e))?;

    if !commit_output.status.success() {
        let stderr = String::from_utf8_lossy(&commit_output.stderr);
        // Check if there are still unresolved conflicts
        if stderr.contains("unmerged") || stderr.contains("conflict") {
            return Err("Some conflicts remain unresolved. Please resolve all conflicting files.".to_string());
        }
        return Err(format!("Failed to commit merge: {}", stderr));
    }

    Ok(())
}

/// Abort an in-progress merge.
#[tauri::command]
pub async fn abort_merge(
    _app: AppHandle,
    project_path: String,
) -> Result<(), String> {
    let output = Command::new("git")
        .args(["merge", "--abort"])
        .current_dir(&project_path)
        .output()
        .map_err(|e| format!("Failed to abort merge: {}", e))?;

    if !output.status.success() {
        // Not in a merge state is fine
        let stderr = String::from_utf8_lossy(&output.stderr);
        if !stderr.contains("no merge") {
            return Err(format!("Failed to abort merge: {}", stderr));
        }
    }

    Ok(())
}
