//! Process spawning and management for agent execution.

use std::collections::HashMap;
use std::fs;
use std::io::{BufRead, BufReader, Write};
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use std::thread;
use std::time::Duration;

use tauri::{AppHandle, Emitter, Manager};
use uuid::Uuid;

use crate::models::{
    AgentExitEvent, AgentOutputEvent, KillAgentResult, ProcessHistory, ProcessHistoryEntry,
    ProcessLogEntry, SpawnAgentResult, WaitAgentResult,
};

lazy_static::lazy_static! {
    pub static ref PROCESSES: Mutex<HashMap<String, Child>> = Mutex::new(HashMap::new());
}

/// Kills all spawned processes. Called on app shutdown.
pub fn kill_all_processes() {
    let mut processes = match PROCESSES.lock() {
        Ok(p) => p,
        Err(e) => {
            eprintln!("Failed to lock processes for cleanup: {}", e);
            return;
        }
    };

    let process_ids: Vec<String> = processes.keys().cloned().collect();
    let count = process_ids.len();
    
    if count == 0 {
        return;
    }

    println!("Cleaning up {} spawned process(es)...", count);

    for process_id in process_ids {
        if let Some(child) = processes.get_mut(&process_id) {
            #[cfg(unix)]
            {
                let pid = child.id();
                // Use negative pid to kill the entire process group
                let pgid = -(pid as i32);
                
                // Send SIGTERM first for graceful shutdown to process group
                unsafe {
                    libc::kill(pgid, libc::SIGTERM);
                }
                
                // Give processes a short time to terminate gracefully
                let start = std::time::Instant::now();
                let timeout = Duration::from_millis(500);
                
                loop {
                    match child.try_wait() {
                        Ok(Some(_)) => break,
                        Ok(None) => {
                            if start.elapsed() >= timeout {
                                // Force kill process group if still running
                                unsafe {
                                    libc::kill(pgid, libc::SIGKILL);
                                }
                                let _ = child.wait();
                                break;
                            }
                            thread::sleep(Duration::from_millis(50));
                        }
                        Err(_) => break,
                    }
                }
            }

            #[cfg(windows)]
            {
                let _ = child.kill();
                let _ = child.wait();
            }
        }
    }

    processes.clear();
    println!("All processes cleaned up.");
}

/// Spawns an agent process and returns its ID.
/// This is async to avoid blocking the UI thread during process startup.
#[tauri::command(rename_all = "camelCase")]
pub async fn spawn_agent(
    app: AppHandle,
    executable: String,
    args: Vec<String>,
    working_directory: String,
    env: Option<HashMap<String, String>>,
) -> Result<SpawnAgentResult, String> {
    let process_id = Uuid::new_v4().to_string();

    // Spawn the process in a blocking task to avoid blocking the UI
    let child = tokio::task::spawn_blocking(move || {
        let mut cmd = Command::new(&executable);
        cmd.args(&args)
            .current_dir(&working_directory)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());

        // Add custom environment variables if provided
        if let Some(env_vars) = env {
            for (key, value) in env_vars {
                cmd.env(key, value);
            }
        }

        // On Unix, create a new process group so we can kill all child processes
        #[cfg(unix)]
        {
            use std::os::unix::process::CommandExt;
            cmd.process_group(0); // Create new process group with pgid = pid
        }

        cmd.spawn()
            .map_err(|e| format!("Failed to spawn process '{}': {}", executable, e))
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))??;

    let mut child = child;
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

    let mut processes = PROCESSES
        .lock()
        .map_err(|e| format!("Lock error: {}", e))?;
    processes.insert(process_id.clone(), child);

    Ok(SpawnAgentResult { process_id })
}

/// Waits for an agent process to complete.
/// Uses try_wait in a loop to avoid holding the mutex lock, allowing kill_agent to work.
#[tauri::command(rename_all = "camelCase")]
pub async fn wait_agent(app: AppHandle, process_id: String) -> Result<WaitAgentResult, String> {
    let result = tokio::task::spawn_blocking(move || {
        loop {
            // Acquire lock, check process status, then release lock
            let wait_result = {
                let mut processes = PROCESSES
                    .lock()
                    .map_err(|e| format!("Lock error: {}", e))?;

                let child = match processes.get_mut(&process_id) {
                    Some(child) => child,
                    None => {
                        // Process was removed (likely killed by kill_agent)
                        return Ok(WaitAgentResult {
                            process_id: process_id.clone(),
                            exit_code: None,
                            success: false,
                        });
                    }
                };

                match child.try_wait() {
                    Ok(Some(status)) => {
                        // Process has exited
                        let exit_code = status.code();
                        let success = status.success();
                        processes.remove(&process_id);
                        Some(Ok(WaitAgentResult {
                            process_id: process_id.clone(),
                            exit_code,
                            success,
                        }))
                    }
                    Ok(None) => {
                        // Process still running, will check again after sleep
                        None
                    }
                    Err(e) => {
                        processes.remove(&process_id);
                        Some(Err(format!("Failed to wait for process: {}", e)))
                    }
                }
            }; // Lock is released here

            if let Some(result) = wait_result {
                return result;
            }

            // Sleep before checking again - this allows kill_agent to acquire the lock
            thread::sleep(Duration::from_millis(50));
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

/// Kills an agent process asynchronously to avoid blocking the UI.
#[tauri::command(rename_all = "camelCase")]
pub async fn kill_agent(app: AppHandle, process_id: String) -> Result<KillAgentResult, String> {
    let pid = process_id.clone();

    let result = tokio::task::spawn_blocking(move || kill_agent_blocking(&pid))
        .await
        .map_err(|e| format!("Task join error: {}", e))??;

    // Emit exit event if process was killed successfully
    if result.success {
        let event = AgentExitEvent {
            process_id: process_id.clone(),
            exit_code: None,
            success: false, // Killed, not natural exit
        };
        let _ = app.emit("agent-exit", event);
    }

    Ok(result)
}

/// Blocking implementation of kill_agent for use in spawn_blocking.
fn kill_agent_blocking(process_id: &str) -> Result<KillAgentResult, String> {
    let mut processes = PROCESSES
        .lock()
        .map_err(|e| format!("Lock error: {}", e))?;

    let child = match processes.get_mut(process_id) {
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
        // Use negative pid to kill the entire process group
        let pgid = -(pid as i32);

        unsafe {
            // Send SIGTERM to the entire process group
            libc::kill(pgid, libc::SIGTERM);
        }

        let start = std::time::Instant::now();
        let timeout = Duration::from_secs(5);

        loop {
            match child.try_wait() {
                Ok(Some(_status)) => {
                    processes.remove(process_id);
                    return Ok(KillAgentResult {
                        success: true,
                        message: "Process group terminated gracefully with SIGTERM".to_string(),
                    });
                }
                Ok(None) => {
                    if start.elapsed() >= timeout {
                        unsafe {
                            // Force kill the entire process group
                            libc::kill(pgid, libc::SIGKILL);
                        }
                        let _ = child.wait();
                        processes.remove(process_id);
                        return Ok(KillAgentResult {
                            success: true,
                            message: "Process group killed with SIGKILL after timeout".to_string(),
                        });
                    }
                    thread::sleep(Duration::from_millis(100));
                }
                Err(e) => {
                    processes.remove(process_id);
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
                processes.remove(process_id);
                Ok(KillAgentResult {
                    success: true,
                    message: "Process killed".to_string(),
                })
            }
            Err(e) => {
                processes.remove(process_id);
                Ok(KillAgentResult {
                    success: false,
                    message: format!("Failed to kill process: {}", e),
                })
            }
        }
    }
}

/// Saves process logs to a file in the app data directory.
/// Uses spawn_blocking to avoid blocking the main thread.
#[tauri::command(rename_all = "camelCase")]
pub async fn save_process_log(
    app: AppHandle,
    process_id: String,
    project_id: String,
    process_type: String,
    label: String,
    logs: Vec<ProcessLogEntry>,
) -> Result<String, String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data directory: {}", e))?;

    tokio::task::spawn_blocking(move || {
        save_process_log_blocking(app_data_dir, process_id, project_id, process_type, label, logs)
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?
}

fn save_process_log_blocking(
    app_data_dir: std::path::PathBuf,
    process_id: String,
    project_id: String,
    process_type: String,
    label: String,
    logs: Vec<ProcessLogEntry>,
) -> Result<String, String> {

    let logs_dir = app_data_dir.join("logs");
    if !logs_dir.exists() {
        fs::create_dir_all(&logs_dir)
            .map_err(|e| format!("Failed to create logs directory: {}", e))?;
    }

    let timestamp = chrono::Utc::now().format("%Y%m%d_%H%M%S").to_string();
    let safe_label = label.replace(
        |c: char| !c.is_alphanumeric() && c != '-' && c != '_',
        "_",
    );
    let filename = format!(
        "{}_{}_{}_{}.log",
        timestamp,
        process_type,
        safe_label,
        &process_id[..8.min(process_id.len())]
    );
    let log_path = logs_dir.join(&filename);

    let mut file =
        fs::File::create(&log_path).map_err(|e| format!("Failed to create log file: {}", e))?;

    // Write header
    writeln!(file, "========================================")
        .map_err(|e| format!("Write error: {}", e))?;
    writeln!(file, "Process Log").map_err(|e| format!("Write error: {}", e))?;
    writeln!(file, "========================================")
        .map_err(|e| format!("Write error: {}", e))?;
    writeln!(file, "Process ID: {}", process_id).map_err(|e| format!("Write error: {}", e))?;
    writeln!(file, "Project ID: {}", project_id).map_err(|e| format!("Write error: {}", e))?;
    writeln!(file, "Type: {}", process_type).map_err(|e| format!("Write error: {}", e))?;
    writeln!(file, "Label: {}", label).map_err(|e| format!("Write error: {}", e))?;
    writeln!(file, "Created: {}", chrono::Utc::now().to_rfc3339())
        .map_err(|e| format!("Write error: {}", e))?;
    writeln!(file, "========================================")
        .map_err(|e| format!("Write error: {}", e))?;
    writeln!(file).map_err(|e| format!("Write error: {}", e))?;

    // Write log entries
    for entry in logs {
        let type_prefix = match entry.log_type.as_str() {
            "stderr" => "[ERR]",
            "system" => "[SYS]",
            _ => "[OUT]",
        };
        writeln!(
            file,
            "[{}] {} {}",
            entry.timestamp, type_prefix, entry.content
        )
        .map_err(|e| format!("Write error: {}", e))?;
    }

    Ok(log_path.to_string_lossy().to_string())
}

/// Saves a process history entry.
/// Uses spawn_blocking to avoid blocking the main thread.
#[tauri::command(rename_all = "camelCase")]
pub async fn save_process_history_entry(
    app: AppHandle,
    entry: ProcessHistoryEntry,
) -> Result<(), String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data directory: {}", e))?;

    tokio::task::spawn_blocking(move || {
        let history_path = app_data_dir.join("process-history.json");

        // Load existing history
        let mut history = if history_path.exists() {
            let content = fs::read_to_string(&history_path)
                .map_err(|e| format!("Failed to read process history: {}", e))?;
            serde_json::from_str::<ProcessHistory>(&content).unwrap_or(ProcessHistory {
                entries: Vec::new(),
            })
        } else {
            ProcessHistory {
                entries: Vec::new(),
            }
        };

        // Add new entry at the beginning (most recent first)
        history.entries.insert(0, entry);

        // Keep only the last 500 entries
        if history.entries.len() > 500 {
            history.entries.truncate(500);
        }

        // Save back
        let json = serde_json::to_string_pretty(&history)
            .map_err(|e| format!("Failed to serialize process history: {}", e))?;

        fs::write(&history_path, json)
            .map_err(|e| format!("Failed to write process history: {}", e))?;

        Ok(())
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?
}

/// Loads process history for a specific project.
/// Uses spawn_blocking to avoid blocking the main thread.
#[tauri::command(rename_all = "camelCase")]
pub async fn load_process_history(
    app: AppHandle,
    project_id: String,
) -> Result<ProcessHistory, String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data directory: {}", e))?;

    tokio::task::spawn_blocking(move || {
        let history_path = app_data_dir.join("process-history.json");

        if !history_path.exists() {
            return Ok(ProcessHistory {
                entries: Vec::new(),
            });
        }

        let content = fs::read_to_string(&history_path)
            .map_err(|e| format!("Failed to read process history: {}", e))?;

        let history: ProcessHistory = serde_json::from_str(&content)
            .map_err(|e| format!("Failed to parse process history: {}", e))?;

        // Filter by project ID
        let filtered = ProcessHistory {
            entries: history
                .entries
                .into_iter()
                .filter(|e| e.project_id == project_id)
                .collect(),
        };

        Ok(filtered)
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?
}

/// Reads a log file's contents.
/// Uses spawn_blocking to avoid blocking the main thread.
#[tauri::command(rename_all = "camelCase")]
pub async fn read_process_log_file(log_file_path: String) -> Result<String, String> {
    tokio::task::spawn_blocking(move || {
        fs::read_to_string(&log_file_path)
            .map_err(|e| format!("Failed to read log file: {}", e))
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?
}
