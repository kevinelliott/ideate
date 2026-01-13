//! Data models and structures used throughout the application.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;

// ============================================================================
// Project Models
// ============================================================================

#[derive(Debug, Serialize, Deserialize)]
pub struct ProjectConfig {
    pub name: String,
    pub description: String,
    pub agent: Option<String>,
    pub autonomy: String,
    #[serde(default)]
    pub build_mode: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ProjectSettings {
    pub agent: Option<String>,
    pub autonomy: String,
    #[serde(default)]
    pub build_mode: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CreateProjectResult {
    pub path: String,
    pub config_path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StoredProject {
    pub id: String,
    pub name: String,
    pub description: String,
    pub path: String,
    pub status: String,
    #[serde(rename = "createdAt")]
    pub created_at: String,
}

// ============================================================================
// PRD / Story Models
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Story {
    pub id: String,
    pub title: String,
    pub description: String,
    #[serde(rename = "acceptanceCriteria")]
    pub acceptance_criteria: Vec<String>,
    pub priority: i32,
    pub passes: bool,
    #[serde(default)]
    pub status: Option<String>,
    pub notes: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Prd {
    #[serde(default)]
    pub project: Option<String>,
    #[serde(rename = "branchName", default)]
    pub branch_name: Option<String>,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(rename = "userStories")]
    pub user_stories: Vec<Story>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StoryRetryInfo {
    #[serde(rename = "retryCount")]
    pub retry_count: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProjectState {
    #[serde(rename = "currentStoryId")]
    pub current_story_id: Option<String>,
    #[serde(rename = "storyStatuses")]
    pub story_statuses: HashMap<String, String>,
    #[serde(rename = "storyRetries")]
    pub story_retries: HashMap<String, StoryRetryInfo>,
    #[serde(rename = "buildPhase")]
    pub build_phase: String,
}

// ============================================================================
// Cost Tracking Models
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CostEntry {
    pub id: String,
    #[serde(rename = "projectId")]
    pub project_id: String,
    pub timestamp: String,
    #[serde(rename = "agentId")]
    pub agent_id: String,
    pub description: String,
    #[serde(rename = "inputTokens", default)]
    pub input_tokens: Option<i64>,
    #[serde(rename = "outputTokens", default)]
    pub output_tokens: Option<i64>,
    #[serde(rename = "totalTokens", default)]
    pub total_tokens: Option<i64>,
    #[serde(default)]
    pub cost: Option<f64>,
    #[serde(default)]
    pub credits: Option<f64>,
    #[serde(default)]
    pub model: Option<String>,
    #[serde(rename = "threadId", default)]
    pub thread_id: Option<String>,
    #[serde(rename = "durationMs", default)]
    pub duration_ms: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CostHistory {
    pub entries: Vec<CostEntry>,
}

// ============================================================================
// Ideas Models
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Idea {
    pub id: String,
    pub title: String,
    pub summary: String,
    pub description: String,
    #[serde(rename = "createdAt")]
    pub created_at: String,
    #[serde(rename = "updatedAt")]
    pub updated_at: String,
}

// ============================================================================
// Process / Agent Execution Models
// ============================================================================

#[derive(Debug, Serialize, Deserialize)]
pub struct SpawnAgentResult {
    pub process_id: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct KillAgentResult {
    pub success: bool,
    pub message: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct WaitAgentResult {
    pub process_id: String,
    pub exit_code: Option<i32>,
    pub success: bool,
}

#[derive(Clone, Serialize)]
pub struct AgentOutputEvent {
    pub process_id: String,
    pub stream_type: String,
    pub content: String,
}

#[derive(Clone, Serialize)]
pub struct AgentExitEvent {
    pub process_id: String,
    pub exit_code: Option<i32>,
    pub success: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProcessLogEntry {
    pub timestamp: String,
    #[serde(rename = "type")]
    pub log_type: String,
    pub content: String,
}

// ============================================================================
// Agent Plugin Models
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentModel {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub provider: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentPlugin {
    pub id: String,
    pub name: String,
    pub command: String,
    #[serde(rename = "versionCommand")]
    pub version_command: Vec<String>,
    #[serde(rename = "printArgs")]
    pub print_args: Vec<String>,
    #[serde(rename = "interactiveArgs")]
    pub interactive_args: Vec<String>,
    #[serde(rename = "defaultModel", default)]
    pub default_model: Option<String>,
    #[serde(rename = "supportedModels", default)]
    pub supported_models: Vec<AgentModel>,
    pub capabilities: Vec<String>,
    pub website: String,
    pub description: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentPluginStatus {
    #[serde(flatten)]
    pub agent: AgentPlugin,
    pub status: String,
    #[serde(rename = "installedVersion", default)]
    pub installed_version: Option<String>,
    #[serde(rename = "cliPath", default)]
    pub cli_path: Option<String>,
}

// ============================================================================
// Preferences Models
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentCliPath {
    #[serde(rename = "agentId")]
    pub agent_id: String,
    pub path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Preferences {
    #[serde(rename = "defaultAgent", default)]
    pub default_agent: Option<String>,
    #[serde(rename = "defaultAutonomy", default = "default_autonomy")]
    pub default_autonomy: String,
    #[serde(rename = "defaultBuildMode", default = "default_build_mode")]
    pub default_build_mode: String,
    #[serde(rename = "logBufferSize", default = "default_log_buffer_size")]
    pub log_buffer_size: i32,
    #[serde(rename = "agentPaths", default)]
    pub agent_paths: Vec<AgentCliPath>,
    #[serde(default = "default_theme")]
    pub theme: String,
    #[serde(rename = "appIcon", default = "default_app_icon")]
    pub app_icon: String,
    #[serde(rename = "promptOverrides", default)]
    pub prompt_overrides: HashMap<String, String>,
    #[serde(rename = "hasSeenWelcomeGuide", default)]
    pub has_seen_welcome_guide: bool,
}

fn default_autonomy() -> String {
    "autonomous".to_string()
}

fn default_build_mode() -> String {
    "ralph".to_string()
}

fn default_log_buffer_size() -> i32 {
    1000
}

fn default_app_icon() -> String {
    "transparent".to_string()
}

fn default_theme() -> String {
    "system".to_string()
}

impl Default for Preferences {
    fn default() -> Self {
        Preferences {
            default_agent: None,
            default_autonomy: default_autonomy(),
            default_build_mode: default_build_mode(),
            log_buffer_size: default_log_buffer_size(),
            agent_paths: Vec::new(),
            theme: default_theme(),
            app_icon: default_app_icon(),
            prompt_overrides: HashMap::new(),
            has_seen_welcome_guide: false,
        }
    }
}

// ============================================================================
// Duration Tracking Models
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RecentThreadDuration {
    #[serde(rename = "threadId")]
    pub thread_id: Option<String>,
    #[serde(rename = "durationMs")]
    pub duration_ms: i64,
}
