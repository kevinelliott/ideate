use portable_pty::{native_pty_system, CommandBuilder, PtySize};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::Mutex;
use std::thread;
use tauri::{AppHandle, Emitter};
use uuid::Uuid;

// PTY Terminal structures
struct PtyTerminal {
    master: Box<dyn portable_pty::MasterPty + Send>,
    writer: Box<dyn Write + Send>,
    child: Box<dyn portable_pty::Child + Send + Sync>,
}

lazy_static::lazy_static! {
    static ref PTY_TERMINALS: Mutex<HashMap<String, PtyTerminal>> = Mutex::new(HashMap::new());
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SpawnTerminalResult {
    pub terminal_id: String,
}

#[derive(Clone, Serialize)]
pub struct TerminalOutputEvent {
    pub terminal_id: String,
    pub data: String,
}

#[derive(Clone, Serialize)]
pub struct TerminalExitEvent {
    pub terminal_id: String,
    pub exit_code: Option<u32>,
}

#[tauri::command]
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

    // Get the user's shell
    let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/bash".to_string());

    // Spawn as a login shell with -l flag to load user's profile
    let mut cmd = CommandBuilder::new(&shell);
    cmd.arg("-l"); // Login shell
    cmd.cwd(&working_directory);

    // Set up environment for interactive shell
    cmd.env("TERM", "xterm-256color");
    cmd.env("COLORTERM", "truecolor");
    
    // Preserve important environment variables
    if let Ok(home) = std::env::var("HOME") {
        cmd.env("HOME", home);
    }
    if let Ok(user) = std::env::var("USER") {
        cmd.env("USER", user);
    }
    if let Ok(path) = std::env::var("PATH") {
        cmd.env("PATH", path);
    }
    if let Ok(lang) = std::env::var("LANG") {
        cmd.env("LANG", lang);
    }

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

    let terminal_id_clone = terminal_id.clone();
    let app_clone = app.clone();

    // Spawn a thread to read PTY output and emit events
    thread::spawn(move || {
        let mut buffer = [0u8; 4096];
        loop {
            match reader.read(&mut buffer) {
                Ok(0) => break, // EOF
                Ok(n) => {
                    // Convert to string, replacing invalid UTF-8 with replacement character
                    let data = String::from_utf8_lossy(&buffer[..n]).to_string();
                    let event = TerminalOutputEvent {
                        terminal_id: terminal_id_clone.clone(),
                        data,
                    };
                    if app_clone.emit("terminal-output", event).is_err() {
                        break;
                    }
                }
                Err(e) => {
                    // EAGAIN/EWOULDBLOCK are not errors, just no data available
                    if e.kind() != std::io::ErrorKind::WouldBlock {
                        eprintln!("PTY read error: {}", e);
                        break;
                    }
                }
            }
        }
    });

    let pty_terminal = PtyTerminal {
        master,
        writer,
        child,
    };

    let mut terminals = PTY_TERMINALS
        .lock()
        .map_err(|e| format!("Lock error: {}", e))?;
    terminals.insert(terminal_id.clone(), pty_terminal);

    Ok(SpawnTerminalResult { terminal_id })
}

#[tauri::command]
pub fn write_terminal(terminal_id: String, data: String) -> Result<(), String> {
    let mut terminals = PTY_TERMINALS
        .lock()
        .map_err(|e| format!("Lock error: {}", e))?;

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

#[tauri::command]
pub fn resize_terminal(terminal_id: String, cols: u16, rows: u16) -> Result<(), String> {
    let terminals = PTY_TERMINALS
        .lock()
        .map_err(|e| format!("Lock error: {}", e))?;

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

#[tauri::command]
pub fn kill_terminal(app: AppHandle, terminal_id: String) -> Result<(), String> {
    let mut terminals = PTY_TERMINALS
        .lock()
        .map_err(|e| format!("Lock error: {}", e))?;

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
