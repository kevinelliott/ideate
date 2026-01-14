//! PTY terminal management for embedded shell sessions.
//!
//! This module provides functionality for spawning and managing PTY-based
//! terminal sessions. Each terminal runs in its own thread and communicates
//! with the frontend via Tauri events.

#[cfg(unix)]
use portable_pty::{native_pty_system, CommandBuilder, PtySize};
use serde::{Deserialize, Serialize};
#[cfg(unix)]
use std::collections::HashMap;
#[cfg(unix)]
use std::io::{Read, Write};
#[cfg(unix)]
use std::sync::Mutex;
#[cfg(unix)]
use std::thread;
#[cfg(unix)]
use std::time::Duration;
use tauri::AppHandle;
#[cfg(unix)]
use tauri::Emitter;
#[cfg(unix)]
use uuid::Uuid;

#[cfg(unix)]
struct PtyTerminal {
    master: Box<dyn portable_pty::MasterPty + Send>,
    writer: Box<dyn Write + Send>,
    child: Box<dyn portable_pty::Child + Send>,
}

#[cfg(unix)]
lazy_static::lazy_static! {
    static ref PTY_TERMINALS: Mutex<HashMap<String, PtyTerminal>> = Mutex::new(HashMap::new());
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SpawnTerminalResult {
    pub terminal_id: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TerminalOutputEvent {
    pub terminal_id: String,
    pub data: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TerminalExitEvent {
    pub terminal_id: String,
    pub exit_code: Option<u32>,
}

/// Builds the shell command with proper environment setup.
#[cfg(unix)]
fn build_shell_command(working_directory: &str) -> CommandBuilder {
    // Use zsh as fallback on macOS, bash on other Unix systems
    #[cfg(target_os = "macos")]
    let default_shell = "/bin/zsh";
    #[cfg(not(target_os = "macos"))]
    let default_shell = "/bin/bash";

    let shell = std::env::var("SHELL").unwrap_or_else(|_| default_shell.to_string());

    let mut cmd = CommandBuilder::new(&shell);
    cmd.arg("-l"); // Login shell to load user's profile
    cmd.cwd(working_directory);

    // Set up terminal environment
    cmd.env("TERM", "xterm-256color");
    cmd.env("COLORTERM", "truecolor");

    // Preserve important environment variables
    for key in ["HOME", "USER", "PATH", "LANG", "LC_ALL", "EDITOR", "VISUAL"] {
        if let Ok(val) = std::env::var(key) {
            cmd.env(key, val);
        }
    }

    cmd
}

/// Spawns a new PTY terminal session.
///
/// Returns a terminal ID that can be used for subsequent operations.
#[cfg(unix)]
#[tauri::command(rename_all = "camelCase")]
pub fn spawn_terminal(
    app: AppHandle,
    working_directory: String,
    cols: u16,
    rows: u16,
) -> Result<SpawnTerminalResult, String> {
    let terminal_id = Uuid::new_v4().to_string();

    let pty_system = native_pty_system();

    let pair = pty_system
        .openpty(PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| format!("Failed to open PTY: {}", e))?;

    let cmd = build_shell_command(&working_directory);

    let child = pair
        .slave
        .spawn_command(cmd)
        .map_err(|e| format!("Failed to spawn shell: {}", e))?;

    // Drop the slave now that the child has spawned
    drop(pair.slave);

    let master = pair.master;

    // Get a reader for the PTY output BEFORE taking the writer
    let mut reader = master
        .try_clone_reader()
        .map_err(|e| format!("Failed to get PTY reader: {}", e))?;

    let writer = master
        .take_writer()
        .map_err(|e| format!("Failed to get PTY writer: {}", e))?;

    let terminal_id_for_output = terminal_id.clone();
    let terminal_id_for_cleanup = terminal_id.clone();
    let app_for_output = app.clone();
    let app_for_cleanup = app.clone();

    // Spawn a thread to read PTY output and emit events
    thread::spawn(move || {
        let mut buffer = [0u8; 4096];
        loop {
            match reader.read(&mut buffer) {
                Ok(0) => break, // EOF - shell exited
                Ok(n) => {
                    // Convert to string, replacing invalid UTF-8 with replacement character
                    let data = String::from_utf8_lossy(&buffer[..n]).to_string();
                    let event = TerminalOutputEvent {
                        terminal_id: terminal_id_for_output.clone(),
                        data,
                    };
                    if app_for_output.emit("terminal-output", event).is_err() {
                        // Frontend went away; stop reading
                        break;
                    }
                }
                Err(e) => {
                    if e.kind() == std::io::ErrorKind::WouldBlock {
                        // No data available, avoid busy loop
                        thread::sleep(Duration::from_millis(5));
                    } else {
                        eprintln!("PTY read error: {}", e);
                        break;
                    }
                }
            }
        }

        // After loop: clean up this terminal and notify frontend
        if let Ok(mut terminals) = PTY_TERMINALS.lock() {
            if let Some(mut terminal) = terminals.remove(&terminal_id_for_cleanup) {
                // Child may already be dead; just try to get an exit code
                let exit_code = match terminal.child.try_wait() {
                    Ok(Some(status)) => Some(status.exit_code()),
                    _ => None,
                };

                let event = TerminalExitEvent {
                    terminal_id: terminal_id_for_cleanup.clone(),
                    exit_code,
                };
                let _ = app_for_cleanup.emit("terminal-exit", event);
                // `terminal` drops here, closing master/writer/child handles
            }
        } else {
            eprintln!(
                "Failed to lock PTY_TERMINALS for cleanup of {}",
                terminal_id_for_cleanup
            );
        }
    });

    let pty_terminal = PtyTerminal {
        master,
        writer,
        child,
    };

    let mut terminals = PTY_TERMINALS
        .lock()
        .map_err(|_| "Lock error: PTY_TERMINALS mutex poisoned")?;
    terminals.insert(terminal_id.clone(), pty_terminal);

    Ok(SpawnTerminalResult { terminal_id })
}

/// Writes data to a terminal's PTY.
#[cfg(unix)]
#[tauri::command(rename_all = "camelCase")]
pub fn write_terminal(terminal_id: String, data: String) -> Result<(), String> {
    let mut terminals = PTY_TERMINALS
        .lock()
        .map_err(|_| "Lock error: PTY_TERMINALS mutex poisoned")?;

    let terminal = terminals
        .get_mut(&terminal_id)
        .ok_or_else(|| format!("Terminal {} not found", terminal_id))?;

    terminal
        .writer
        .write_all(data.as_bytes())
        .map_err(|e| format!("Failed to write to PTY: {}", e))?;

    terminal
        .writer
        .flush()
        .map_err(|e| format!("Failed to flush PTY: {}", e))?;

    Ok(())
}

/// Resizes a terminal's PTY to match the frontend dimensions.
#[cfg(unix)]
#[tauri::command(rename_all = "camelCase")]
pub fn resize_terminal(terminal_id: String, cols: u16, rows: u16) -> Result<(), String> {
    let terminals = PTY_TERMINALS
        .lock()
        .map_err(|_| "Lock error: PTY_TERMINALS mutex poisoned")?;

    let terminal = terminals
        .get(&terminal_id)
        .ok_or_else(|| format!("Terminal {} not found", terminal_id))?;

    terminal
        .master
        .resize(PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| format!("Failed to resize PTY: {}", e))?;

    Ok(())
}

/// Kills a terminal and cleans up its resources.
#[cfg(unix)]
#[tauri::command(rename_all = "camelCase")]
pub fn kill_terminal(app: AppHandle, terminal_id: String) -> Result<(), String> {
    let mut terminals = PTY_TERMINALS
        .lock()
        .map_err(|_| "Lock error: PTY_TERMINALS mutex poisoned")?;

    if let Some(mut terminal) = terminals.remove(&terminal_id) {
        // Try to kill the child process
        let _ = terminal.child.kill();

        // Wait briefly and get exit status
        let exit_code = match terminal.child.try_wait() {
            Ok(Some(status)) => Some(status.exit_code()),
            _ => None,
        };

        let event = TerminalExitEvent {
            terminal_id: terminal_id.clone(),
            exit_code,
        };
        let _ = app.emit("terminal-exit", event);
    }

    Ok(())
}

// Non-Unix stubs - terminal not supported on Windows
#[cfg(not(unix))]
#[tauri::command]
pub fn spawn_terminal(
    _app: AppHandle,
    _working_directory: String,
    _cols: u16,
    _rows: u16,
) -> Result<SpawnTerminalResult, String> {
    Err("Embedded terminal is only supported on Unix-like systems".into())
}

#[cfg(not(unix))]
#[tauri::command]
pub fn write_terminal(_terminal_id: String, _data: String) -> Result<(), String> {
    Err("Embedded terminal is only supported on Unix-like systems".into())
}

#[cfg(not(unix))]
#[tauri::command]
pub fn resize_terminal(_terminal_id: String, _cols: u16, _rows: u16) -> Result<(), String> {
    Err("Embedded terminal is only supported on Unix-like systems".into())
}

#[cfg(not(unix))]
#[tauri::command]
pub fn kill_terminal(_app: AppHandle, _terminal_id: String) -> Result<(), String> {
    Err("Embedded terminal is only supported on Unix-like systems".into())
}
