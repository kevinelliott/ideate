//! Process spawning and management for agent execution.

use std::collections::HashMap;
use std::io::{BufRead, BufReader, Write};
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use std::thread;
use std::time::Duration;
use std::fs;

use tauri::{AppHandle, Emitter, Manager};
use uuid::Uuid;

use crate::models::{
    AgentExitEvent, AgentOutputEvent, KillAgentResult, ProcessLogEntry, SpawnAgentResult,
    WaitAgentResult,
};

lazy_static::lazy_static! {
    pub static ref PROCESSES: Mutex<HashMap<String, Child>> = Mutex::new(HashMap::new());
}

/// Spawns an agent process and returns its ID.
#[tauri::command]
pub fn spawn_agent(
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

    let mut processes = PROCESSES
        .lock()
        .map_err(|e| format!("Lock error: {}", e))?;
    processes.insert(process_id.clone(), child);

    Ok(SpawnAgentResult { process_id })
}

/// Waits for an agent process to complete.
#[tauri::command]
pub async fn wait_agent(app: AppHandle, process_id: String) -> Result<WaitAgentResult, String> {
    let result = tokio::task::spawn_blocking(move || {
        let mut processes = PROCESSES
            .lock()
            .map_err(|e| format!("Lock error: {}", e))?;

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

/// Kills an agent process.
#[tauri::command]
pub fn kill_agent(process_id: String) -> Result<KillAgentResult, String> {
    let mut processes = PROCESSES
        .lock()
        .map_err(|e| format!("Lock error: {}", e))?;

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

/// Saves process logs to a file in the app data directory.
#[tauri::command]
pub fn save_process_log(
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
