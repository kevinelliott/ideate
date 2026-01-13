//! Usage tracking for Amp and Claude Code agents.

use serde::Deserialize;
use std::fs;

use crate::models::RecentThreadDuration;

// ============================================================================
// Amp Usage Data Structures
// ============================================================================

#[derive(Debug, Clone, Deserialize)]
struct AmpThread {
    #[serde(default)]
    created: Option<i64>, // Unix timestamp in milliseconds
    #[serde(default)]
    title: Option<String>,
    #[serde(default)]
    messages: Vec<AmpMessage>,
}

#[derive(Debug, Clone, Deserialize)]
struct AmpMessage {
    #[serde(default)]
    role: Option<String>,
    #[serde(default)]
    usage: Option<AmpMessageUsage>,
    #[serde(default)]
    state: Option<AmpMessageState>,
}

#[derive(Debug, Clone, Deserialize)]
struct AmpMessageState {
    #[serde(rename = "stopReason", default)]
    stop_reason: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
struct AmpMessageUsage {
    #[serde(rename = "inputTokens", default)]
    input_tokens: Option<i64>,
    #[serde(rename = "outputTokens", default)]
    output_tokens: Option<i64>,
    #[serde(rename = "cacheCreationInputTokens", default)]
    cache_creation_input_tokens: Option<i64>,
    #[serde(rename = "cacheReadInputTokens", default)]
    cache_read_input_tokens: Option<i64>,
    #[serde(default)]
    credits: Option<f64>,
    #[serde(default)]
    model: Option<String>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct AmpUsageEntry {
    #[serde(rename = "threadId")]
    pub thread_id: String,
    #[serde(rename = "threadTitle")]
    pub thread_title: Option<String>,
    pub timestamp: String,
    pub model: Option<String>,
    #[serde(rename = "inputTokens")]
    pub input_tokens: i64,
    #[serde(rename = "outputTokens")]
    pub output_tokens: i64,
    #[serde(rename = "totalTokens")]
    pub total_tokens: i64,
    #[serde(rename = "cacheCreationTokens")]
    pub cache_creation_tokens: i64,
    #[serde(rename = "cacheReadTokens")]
    pub cache_read_tokens: i64,
    pub credits: f64,
    #[serde(rename = "durationMs")]
    pub duration_ms: i64,
    #[serde(rename = "stopReason")]
    pub stop_reason: Option<String>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct AmpUsageSummary {
    pub entries: Vec<AmpUsageEntry>,
    #[serde(rename = "totalInputTokens")]
    pub total_input_tokens: i64,
    #[serde(rename = "totalOutputTokens")]
    pub total_output_tokens: i64,
    #[serde(rename = "totalTokens")]
    pub total_tokens: i64,
    #[serde(rename = "totalCredits")]
    pub total_credits: f64,
    #[serde(rename = "totalDurationMs")]
    pub total_duration_ms: i64,
    #[serde(rename = "threadCount")]
    pub thread_count: i32,
}

// ============================================================================
// Claude Usage Data Structures
// ============================================================================

#[derive(Debug, Clone, Deserialize)]
struct ClaudeMessageUsage {
    #[serde(default)]
    input_tokens: Option<i64>,
    #[serde(default)]
    output_tokens: Option<i64>,
    #[serde(default)]
    cache_creation_input_tokens: Option<i64>,
    #[serde(default)]
    cache_read_input_tokens: Option<i64>,
    #[serde(default)]
    service_tier: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
struct ClaudeMessage {
    #[serde(default)]
    model: Option<String>,
    #[serde(default)]
    usage: Option<ClaudeMessageUsage>,
}

#[derive(Debug, Clone, Deserialize)]
struct ClaudeSessionLine {
    #[serde(rename = "sessionId", default)]
    _session_id: Option<String>,
    #[serde(default)]
    timestamp: Option<String>,
    #[serde(rename = "type", default)]
    entry_type: Option<String>,
    #[serde(default)]
    message: Option<ClaudeMessage>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct ClaudeUsageEntry {
    #[serde(rename = "sessionId")]
    pub session_id: String,
    #[serde(rename = "projectPath")]
    pub project_path: String,
    pub timestamp: String,
    pub model: Option<String>,
    #[serde(rename = "inputTokens")]
    pub input_tokens: i64,
    #[serde(rename = "outputTokens")]
    pub output_tokens: i64,
    #[serde(rename = "totalTokens")]
    pub total_tokens: i64,
    #[serde(rename = "cacheCreationTokens")]
    pub cache_creation_tokens: i64,
    #[serde(rename = "cacheReadTokens")]
    pub cache_read_tokens: i64,
    #[serde(rename = "durationMs")]
    pub duration_ms: i64,
    #[serde(rename = "serviceTier")]
    pub service_tier: Option<String>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct ClaudeUsageSummary {
    pub entries: Vec<ClaudeUsageEntry>,
    #[serde(rename = "totalInputTokens")]
    pub total_input_tokens: i64,
    #[serde(rename = "totalOutputTokens")]
    pub total_output_tokens: i64,
    #[serde(rename = "totalTokens")]
    pub total_tokens: i64,
    #[serde(rename = "totalDurationMs")]
    pub total_duration_ms: i64,
    #[serde(rename = "sessionCount")]
    pub session_count: i32,
    #[serde(rename = "detectedTier")]
    pub detected_tier: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
struct ClaudeSessionEntry {
    #[serde(rename = "sessionId", default)]
    _session_id: Option<String>,
    #[serde(default)]
    timestamp: Option<String>,
}

// ============================================================================
// Amp Usage Loading
// ============================================================================

fn load_amp_usage_sync(since_timestamp: Option<i64>) -> Result<AmpUsageSummary, String> {
    let home_dir =
        dirs::home_dir().ok_or_else(|| "Could not find home directory".to_string())?;

    let amp_threads_dir = home_dir
        .join(".local")
        .join("share")
        .join("amp")
        .join("threads");

    if !amp_threads_dir.exists() {
        return Ok(AmpUsageSummary {
            entries: Vec::new(),
            total_input_tokens: 0,
            total_output_tokens: 0,
            total_tokens: 0,
            total_credits: 0.0,
            total_duration_ms: 0,
            thread_count: 0,
        });
    }

    let pattern = amp_threads_dir.join("T-*.json");
    let pattern_str = pattern.to_string_lossy();

    let mut entries: Vec<AmpUsageEntry> = Vec::new();
    let mut thread_count = 0;

    for path in glob::glob(&pattern_str).map_err(|e| format!("Glob pattern error: {}", e))? {
        if let Ok(thread_path) = path {
            // Get file modification time for duration calculation
            let file_mtime_ms = fs::metadata(&thread_path)
                .ok()
                .and_then(|m| m.modified().ok())
                .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                .map(|d| d.as_millis() as i64)
                .unwrap_or(0);

            if let Ok(content) = fs::read_to_string(&thread_path) {
                if let Ok(thread) = serde_json::from_str::<AmpThread>(&content) {
                    let created_at_ms = thread.created;

                    // Filter by since_timestamp if provided
                    if let Some(since) = since_timestamp {
                        if let Some(created_ms) = created_at_ms {
                            if created_ms < since {
                                continue;
                            }
                        }
                    }

                    // Aggregate usage from all assistant messages
                    let mut input_tokens: i64 = 0;
                    let mut output_tokens: i64 = 0;
                    let mut cache_creation_tokens: i64 = 0;
                    let mut cache_read_tokens: i64 = 0;
                    let mut credits: f64 = 0.0;
                    let mut last_model: Option<String> = None;
                    let mut last_stop_reason: Option<String> = None;

                    for msg in &thread.messages {
                        if msg.role.as_deref() == Some("assistant") {
                            if let Some(usage) = &msg.usage {
                                input_tokens += usage.input_tokens.unwrap_or(0);
                                output_tokens += usage.output_tokens.unwrap_or(0);
                                cache_creation_tokens +=
                                    usage.cache_creation_input_tokens.unwrap_or(0);
                                cache_read_tokens += usage.cache_read_input_tokens.unwrap_or(0);
                                credits += usage.credits.unwrap_or(0.0);
                                if usage.model.is_some() {
                                    last_model = usage.model.clone();
                                }
                            }
                            if let Some(state) = &msg.state {
                                if state.stop_reason.is_some() {
                                    last_stop_reason = state.stop_reason.clone();
                                }
                            }
                        }
                    }

                    // Calculate duration from creation to last modification
                    let duration_ms = match created_at_ms {
                        Some(created) if file_mtime_ms > created => file_mtime_ms - created,
                        _ => 0,
                    };

                    // Only add if there's actual usage
                    if input_tokens > 0 || output_tokens > 0 || credits > 0.0 {
                        thread_count += 1;

                        let thread_id = thread_path
                            .file_stem()
                            .and_then(|s| s.to_str())
                            .unwrap_or("unknown")
                            .to_string();

                        // Format timestamp from unix ms to ISO string
                        let timestamp = created_at_ms
                            .map(|ms| {
                                chrono::DateTime::from_timestamp_millis(ms)
                                    .map(|dt| dt.to_rfc3339())
                                    .unwrap_or_else(|| "unknown".to_string())
                            })
                            .unwrap_or_else(|| "unknown".to_string());

                        let entry = AmpUsageEntry {
                            thread_id,
                            thread_title: thread.title.clone(),
                            timestamp,
                            model: last_model,
                            input_tokens,
                            output_tokens,
                            total_tokens: input_tokens + output_tokens,
                            cache_creation_tokens,
                            cache_read_tokens,
                            credits,
                            duration_ms,
                            stop_reason: last_stop_reason,
                        };
                        entries.push(entry);
                    }
                }
            }
        }
    }

    let total_input_tokens: i64 = entries.iter().map(|e| e.input_tokens).sum();
    let total_output_tokens: i64 = entries.iter().map(|e| e.output_tokens).sum();
    let total_tokens: i64 = entries.iter().map(|e| e.total_tokens).sum();
    let total_credits: f64 = entries.iter().map(|e| e.credits).sum();
    let total_duration_ms: i64 = entries.iter().map(|e| e.duration_ms).sum();

    Ok(AmpUsageSummary {
        entries,
        total_input_tokens,
        total_output_tokens,
        total_tokens,
        total_credits,
        total_duration_ms,
        thread_count,
    })
}

/// Loads Amp usage statistics from thread files.
#[tauri::command]
pub async fn load_amp_usage(since_timestamp: Option<i64>) -> Result<AmpUsageSummary, String> {
    tokio::task::spawn_blocking(move || load_amp_usage_sync(since_timestamp))
        .await
        .map_err(|e| format!("Task join error: {}", e))?
}

// ============================================================================
// Claude Usage Loading
// ============================================================================

fn load_claude_usage_sync(since_timestamp: Option<i64>) -> Result<ClaudeUsageSummary, String> {
    let home_dir =
        dirs::home_dir().ok_or_else(|| "Could not find home directory".to_string())?;

    let claude_projects_dir = home_dir.join(".claude").join("projects");

    if !claude_projects_dir.exists() {
        return Ok(ClaudeUsageSummary {
            entries: Vec::new(),
            total_input_tokens: 0,
            total_output_tokens: 0,
            total_tokens: 0,
            total_duration_ms: 0,
            session_count: 0,
            detected_tier: None,
        });
    }

    // Find all JSONL session files: ~/.claude/projects/*/*.jsonl
    let pattern = claude_projects_dir.join("*").join("*.jsonl");
    let pattern_str = pattern.to_string_lossy();

    let mut entries: Vec<ClaudeUsageEntry> = Vec::new();
    let mut session_count = 0;
    let mut latest_service_tier: Option<String> = None;
    let mut latest_timestamp: Option<i64> = None;

    for path in glob::glob(&pattern_str).map_err(|e| format!("Glob pattern error: {}", e))? {
        if let Ok(session_path) = path {
            // Extract project path from the parent directory name
            let project_name = session_path
                .parent()
                .and_then(|p| p.file_name())
                .and_then(|n| n.to_str())
                .unwrap_or("unknown")
                .to_string();

            // Session ID is the filename without .jsonl
            let session_id = session_path
                .file_stem()
                .and_then(|s| s.to_str())
                .unwrap_or("unknown")
                .to_string();

            if let Ok(file_content) = fs::read_to_string(&session_path) {
                let mut total_input: i64 = 0;
                let mut total_output: i64 = 0;
                let mut total_cache_creation: i64 = 0;
                let mut total_cache_read: i64 = 0;
                let mut first_model: Option<String> = None;
                let mut first_timestamp: Option<i64> = None;
                let mut last_timestamp: Option<i64> = None;
                let mut session_service_tier: Option<String> = None;
                let mut has_usage = false;

                for line in file_content.lines() {
                    if let Ok(entry) = serde_json::from_str::<ClaudeSessionLine>(line) {
                        // Parse timestamp
                        if let Some(ts_str) = &entry.timestamp {
                            if let Ok(dt) = chrono::DateTime::parse_from_rfc3339(ts_str) {
                                let ts_ms = dt.timestamp_millis();
                                if first_timestamp.is_none() {
                                    first_timestamp = Some(ts_ms);
                                }
                                last_timestamp = Some(ts_ms);
                            }
                        }

                        // Extract usage from assistant messages
                        if entry.entry_type.as_deref() == Some("assistant") {
                            if let Some(message) = &entry.message {
                                if first_model.is_none() {
                                    first_model = message.model.clone();
                                }

                                if let Some(usage) = &message.usage {
                                    has_usage = true;
                                    total_input += usage.input_tokens.unwrap_or(0);
                                    total_output += usage.output_tokens.unwrap_or(0);
                                    total_cache_creation +=
                                        usage.cache_creation_input_tokens.unwrap_or(0);
                                    total_cache_read +=
                                        usage.cache_read_input_tokens.unwrap_or(0);

                                    // Track the most recent service tier
                                    if usage.service_tier.is_some() {
                                        session_service_tier = usage.service_tier.clone();
                                    }
                                }
                            }
                        }
                    }
                }

                // Filter by since_timestamp using first_timestamp
                if let Some(since) = since_timestamp {
                    if let Some(first_ts) = first_timestamp {
                        if first_ts < since {
                            continue;
                        }
                    }
                }

                // Only add if there was actual usage
                if has_usage && (total_input > 0 || total_output > 0) {
                    session_count += 1;

                    let duration_ms = match (first_timestamp, last_timestamp) {
                        (Some(first), Some(last)) if last > first => last - first,
                        _ => 0,
                    };

                    let timestamp = first_timestamp
                        .and_then(|ts| chrono::DateTime::from_timestamp(ts / 1000, 0))
                        .map(|dt| dt.to_rfc3339())
                        .unwrap_or_else(|| "unknown".to_string());

                    // Track the latest service tier across all sessions
                    if let Some(ts) = last_timestamp {
                        if latest_timestamp.is_none() || ts > latest_timestamp.unwrap_or(0) {
                            if session_service_tier.is_some() {
                                latest_timestamp = Some(ts);
                                latest_service_tier = session_service_tier.clone();
                            }
                        }
                    }

                    let entry = ClaudeUsageEntry {
                        session_id,
                        project_path: project_name,
                        timestamp,
                        model: first_model,
                        input_tokens: total_input,
                        output_tokens: total_output,
                        total_tokens: total_input + total_output,
                        cache_creation_tokens: total_cache_creation,
                        cache_read_tokens: total_cache_read,
                        duration_ms,
                        service_tier: session_service_tier,
                    };
                    entries.push(entry);
                }
            }
        }
    }

    let total_input_tokens: i64 = entries.iter().map(|e| e.input_tokens).sum();
    let total_output_tokens: i64 = entries.iter().map(|e| e.output_tokens).sum();
    let total_tokens: i64 = entries.iter().map(|e| e.total_tokens).sum();
    let total_duration_ms: i64 = entries.iter().map(|e| e.duration_ms).sum();

    // Map service tier to user-friendly name
    let detected_tier = latest_service_tier.map(|tier| match tier.as_str() {
        "standard" => "Pro".to_string(),
        "scale" | "max_5x" => "Max (5x)".to_string(),
        "max_20x" => "Max (20x)".to_string(),
        other => other.to_string(),
    });

    Ok(ClaudeUsageSummary {
        entries,
        total_input_tokens,
        total_output_tokens,
        total_tokens,
        total_duration_ms,
        session_count,
        detected_tier,
    })
}

/// Loads Claude Code usage statistics from session files.
#[tauri::command]
pub async fn load_claude_usage(since_timestamp: Option<i64>) -> Result<ClaudeUsageSummary, String> {
    tokio::task::spawn_blocking(move || load_claude_usage_sync(since_timestamp))
        .await
        .map_err(|e| format!("Task join error: {}", e))?
}

// ============================================================================
// Recent Thread Duration
// ============================================================================

fn get_recent_amp_thread_duration_sync(since_ms: i64) -> Result<RecentThreadDuration, String> {
    let home_dir =
        dirs::home_dir().ok_or_else(|| "Could not find home directory".to_string())?;

    let amp_threads_dir = home_dir
        .join(".local")
        .join("share")
        .join("amp")
        .join("threads");

    if !amp_threads_dir.exists() {
        return Ok(RecentThreadDuration {
            thread_id: None,
            duration_ms: 0,
        });
    }

    let pattern = amp_threads_dir.join("T-*.json");
    let pattern_str = pattern.to_string_lossy();

    let mut most_recent: Option<(std::path::PathBuf, i64)> = None;

    // Find the most recently modified thread file that was modified after since_ms
    for path in glob::glob(&pattern_str).map_err(|e| format!("Glob pattern error: {}", e))? {
        if let Ok(thread_path) = path {
            if let Ok(metadata) = fs::metadata(&thread_path) {
                if let Ok(modified) = metadata.modified() {
                    if let Ok(duration) = modified.duration_since(std::time::UNIX_EPOCH) {
                        let mtime_ms = duration.as_millis() as i64;
                        // Only consider files modified after since_ms
                        if mtime_ms >= since_ms {
                            match &most_recent {
                                None => most_recent = Some((thread_path, mtime_ms)),
                                Some((_, prev_mtime)) if mtime_ms > *prev_mtime => {
                                    most_recent = Some((thread_path, mtime_ms));
                                }
                                _ => {}
                            }
                        }
                    }
                }
            }
        }
    }

    // If we found a recent thread, calculate its duration
    if let Some((thread_path, file_mtime_ms)) = most_recent {
        if let Ok(content) = fs::read_to_string(&thread_path) {
            if let Ok(thread) = serde_json::from_str::<AmpThread>(&content) {
                if let Some(created_ms) = thread.created {
                    let duration_ms = file_mtime_ms - created_ms;

                    let thread_id = thread_path
                        .file_stem()
                        .and_then(|s| s.to_str())
                        .map(|s| s.to_string());

                    return Ok(RecentThreadDuration {
                        thread_id,
                        duration_ms,
                    });
                }
            }
        }
    }

    Ok(RecentThreadDuration {
        thread_id: None,
        duration_ms: 0,
    })
}

/// Gets the duration of the most recently active Amp thread.
#[tauri::command]
pub async fn get_recent_amp_thread_duration(since_ms: i64) -> Result<RecentThreadDuration, String> {
    tokio::task::spawn_blocking(move || get_recent_amp_thread_duration_sync(since_ms))
        .await
        .map_err(|e| format!("Task join error: {}", e))?
}

fn get_recent_claude_session_duration_sync(since_ms: i64) -> Result<RecentThreadDuration, String> {
    let home_dir =
        dirs::home_dir().ok_or_else(|| "Could not find home directory".to_string())?;

    let claude_projects_dir = home_dir.join(".claude").join("projects");

    if !claude_projects_dir.exists() {
        return Ok(RecentThreadDuration {
            thread_id: None,
            duration_ms: 0,
        });
    }

    let pattern = claude_projects_dir.join("*").join("*.jsonl");
    let pattern_str = pattern.to_string_lossy();

    let mut most_recent: Option<(std::path::PathBuf, i64)> = None;

    // Find the most recently modified session file that was modified after since_ms
    for path in glob::glob(&pattern_str).map_err(|e| format!("Glob pattern error: {}", e))? {
        if let Ok(session_path) = path {
            if let Ok(metadata) = fs::metadata(&session_path) {
                if let Ok(modified) = metadata.modified() {
                    if let Ok(duration) = modified.duration_since(std::time::UNIX_EPOCH) {
                        let mtime_ms = duration.as_millis() as i64;
                        // Only consider files modified after since_ms
                        if mtime_ms >= since_ms {
                            match &most_recent {
                                None => most_recent = Some((session_path, mtime_ms)),
                                Some((_, prev_mtime)) if mtime_ms > *prev_mtime => {
                                    most_recent = Some((session_path, mtime_ms));
                                }
                                _ => {}
                            }
                        }
                    }
                }
            }
        }
    }

    // If we found a recent session, calculate its duration
    if let Some((session_path, file_mtime_ms)) = most_recent {
        if let Ok(content) = fs::read_to_string(&session_path) {
            // Read the first line to get the first timestamp
            if let Some(first_line) = content.lines().next() {
                if let Ok(entry) = serde_json::from_str::<ClaudeSessionEntry>(first_line) {
                    if let Some(ts_str) = &entry.timestamp {
                        if let Ok(dt) = chrono::DateTime::parse_from_rfc3339(ts_str) {
                            let created_ms = dt.timestamp_millis();
                            let duration_ms = file_mtime_ms - created_ms;

                            let session_id = session_path
                                .file_stem()
                                .and_then(|s| s.to_str())
                                .map(|s| s.to_string());

                            return Ok(RecentThreadDuration {
                                thread_id: session_id,
                                duration_ms,
                            });
                        }
                    }
                }
            }
        }
    }

    Ok(RecentThreadDuration {
        thread_id: None,
        duration_ms: 0,
    })
}

/// Gets the duration of the most recently active Claude session.
#[tauri::command]
pub async fn get_recent_claude_session_duration(
    since_ms: i64,
) -> Result<RecentThreadDuration, String> {
    tokio::task::spawn_blocking(move || get_recent_claude_session_duration_sync(since_ms))
        .await
        .map_err(|e| format!("Task join error: {}", e))?
}
