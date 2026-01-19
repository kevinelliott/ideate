//! Data models and structures used throughout the application.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;

// ============================================================================
// Project Models
// ============================================================================

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
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
#[serde(rename_all = "camelCase")]
pub struct ProjectSettings {
    pub agent: Option<String>,
    pub autonomy: String,
    #[serde(default)]
    pub build_mode: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateProjectResult {
    pub path: String,
    pub config_path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StoredProject {
    pub id: String,
    pub name: String,
    pub description: String,
    pub path: String,
    pub status: String,
    pub created_at: String,
}

// ============================================================================
// PRD / Story Models
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Story {
    pub id: String,
    pub title: String,
    pub description: String,
    pub acceptance_criteria: Vec<String>,
    pub priority: i32,
    pub passes: bool,
    #[serde(default)]
    pub status: Option<String>,
    pub notes: String,
}

/// Project idea - stored in .ideate/idea.json
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectIdea {
    pub title: String,
    pub summary: String,
    pub description: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Prd {
    #[serde(default)]
    pub project: Option<String>,
    #[serde(default)]
    pub branch_name: Option<String>,
    #[serde(default)]
    pub description: Option<String>,
    pub user_stories: Vec<Story>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StoryRetryInfo {
    pub retry_count: i32,
}

// ============================================================================
// Design Document Models
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DesignComponent {
    pub name: String,
    pub description: String,
    #[serde(default)]
    pub responsibilities: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DesignArchitecture {
    #[serde(default)]
    pub overview: Option<String>,
    #[serde(default)]
    pub components: Vec<DesignComponent>,
    #[serde(default)]
    pub data_flow: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DesignTechStack {
    #[serde(default)]
    pub frontend: Vec<String>,
    #[serde(default)]
    pub backend: Vec<String>,
    #[serde(default)]
    pub database: Vec<String>,
    #[serde(default)]
    pub infrastructure: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DesignApiEndpoint {
    pub endpoint: String,
    pub method: String,
    pub description: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DesignDataModel {
    pub name: String,
    #[serde(default)]
    pub fields: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DesignConsiderations {
    #[serde(default)]
    pub security: Vec<String>,
    #[serde(default)]
    pub performance: Vec<String>,
    #[serde(default)]
    pub scalability: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Design {
    pub project: String,
    #[serde(default)]
    pub version: Option<String>,
    #[serde(default)]
    pub generated_at: Option<String>,
    #[serde(default)]
    pub architecture: Option<DesignArchitecture>,
    #[serde(default)]
    pub tech_stack: Option<DesignTechStack>,
    #[serde(default)]
    pub file_structure: Option<String>,
    #[serde(default)]
    pub api_design: Vec<DesignApiEndpoint>,
    #[serde(default)]
    pub data_models: Vec<DesignDataModel>,
    #[serde(default)]
    pub considerations: Option<DesignConsiderations>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectState {
    pub current_story_id: Option<String>,
    pub story_statuses: HashMap<String, String>,
    pub story_retries: HashMap<String, StoryRetryInfo>,
    pub build_phase: String,
}

// ============================================================================
// Cost Tracking Models
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CostEntry {
    pub id: String,
    pub project_id: String,
    pub timestamp: String,
    pub agent_id: String,
    pub description: String,
    #[serde(default)]
    pub input_tokens: Option<i64>,
    #[serde(default)]
    pub output_tokens: Option<i64>,
    #[serde(default)]
    pub total_tokens: Option<i64>,
    #[serde(default)]
    pub cost: Option<f64>,
    #[serde(default)]
    pub credits: Option<f64>,
    #[serde(default)]
    pub model: Option<String>,
    #[serde(default)]
    pub thread_id: Option<String>,
    #[serde(default)]
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
#[serde(rename_all = "camelCase")]
pub struct Idea {
    pub id: String,
    pub title: String,
    pub summary: String,
    pub description: String,
    pub created_at: String,
    pub updated_at: String,
}

// ============================================================================
// Process / Agent Execution Models
// ============================================================================

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SpawnAgentResult {
    pub process_id: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct KillAgentResult {
    pub success: bool,
    pub message: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct WaitAgentResult {
    pub process_id: String,
    pub exit_code: Option<i32>,
    pub success: bool,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentOutputEvent {
    pub process_id: String,
    pub stream_type: String,
    pub content: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentExitEvent {
    pub process_id: String,
    pub exit_code: Option<i32>,
    pub success: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProcessLogEntry {
    pub timestamp: String,
    #[serde(rename = "type")]
    pub log_type: String,
    pub content: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProcessCommand {
    pub executable: String,
    pub args: Vec<String>,
    pub working_directory: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProcessHistoryEntry {
    pub process_id: String,
    pub project_id: String,
    pub process_type: String,
    pub label: String,
    pub started_at: String,
    pub completed_at: String,
    pub duration_ms: i64,
    pub exit_code: Option<i32>,
    pub success: bool,
    #[serde(default)]
    pub agent_id: Option<String>,
    #[serde(default)]
    pub command: Option<ProcessCommand>,
    #[serde(default)]
    pub log_file_path: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProcessHistory {
    pub entries: Vec<ProcessHistoryEntry>,
}

// ============================================================================
// Agent Plugin Models
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentModel {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub provider: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentPlugin {
    pub id: String,
    pub name: String,
    pub command: String,
    pub version_command: Vec<String>,
    pub print_args: Vec<String>,
    pub interactive_args: Vec<String>,
    #[serde(default)]
    pub default_model: Option<String>,
    #[serde(default)]
    pub supported_models: Vec<AgentModel>,
    pub capabilities: Vec<String>,
    pub website: String,
    pub description: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentPluginStatus {
    #[serde(flatten)]
    pub agent: AgentPlugin,
    pub status: String,
    #[serde(default)]
    pub installed_version: Option<String>,
    #[serde(default)]
    pub cli_path: Option<String>,
}

// ============================================================================
// Preferences Models
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentCliPath {
    pub agent_id: String,
    pub path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct OutRayCredentials {
    #[serde(default)]
    pub api_key: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct OutRayConfig {
    #[serde(default)]
    pub enabled: bool,
    #[serde(default)]
    pub use_custom_path: bool,
    #[serde(default)]
    pub cli_path: Option<String>,
    #[serde(default)]
    pub default_subdomain: Option<String>,
    #[serde(default)]
    pub global: Option<OutRayCredentials>,
    #[serde(default)]
    pub per_project: HashMap<String, OutRayCredentials>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Preferences {
    #[serde(default)]
    pub default_agent: Option<String>,
    #[serde(default = "default_autonomy")]
    pub default_autonomy: String,
    #[serde(default = "default_build_mode")]
    pub default_build_mode: String,
    #[serde(default = "default_log_buffer_size")]
    pub log_buffer_size: i32,
    #[serde(default = "default_max_parallel_agents")]
    pub max_parallel_agents: i32,
    #[serde(default)]
    pub agent_paths: Vec<AgentCliPath>,
    #[serde(default = "default_theme_id")]
    pub theme_id: String,
    #[serde(default = "default_color_mode")]
    pub color_mode: String,
    /// Legacy field for backward compatibility
    #[serde(default = "default_color_mode")]
    pub theme: String,
    #[serde(default = "default_app_icon")]
    pub app_icon: String,
    #[serde(default)]
    pub prompt_overrides: HashMap<String, String>,
    #[serde(default)]
    pub has_seen_welcome_guide: bool,
    #[serde(default)]
    pub has_accepted_disclaimer: bool,
    #[serde(default)]
    pub outray: OutRayConfig,
    #[serde(default = "default_build_notifications")]
    pub build_notifications: bool,
    #[serde(default)]
    pub max_tokens_per_story: Option<i64>,
    #[serde(default)]
    pub max_cost_per_build: Option<f64>,
    #[serde(default = "default_warn_on_large_story")]
    pub warn_on_large_story: bool,
    #[serde(default)]
    pub ideas_agent: Option<String>,
    #[serde(default)]
    pub prd_agent: Option<String>,
    #[serde(default)]
    pub specs_agent: Option<String>,
    #[serde(default)]
    pub design_agent: Option<String>,
}

fn default_warn_on_large_story() -> bool {
    true
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

fn default_max_parallel_agents() -> i32 {
    4
}

fn default_app_icon() -> String {
    "transparent".to_string()
}

fn default_build_notifications() -> bool {
    true
}

fn default_theme_id() -> String {
    "ideate".to_string()
}

fn default_color_mode() -> String {
    "system".to_string()
}

impl Default for Preferences {
    fn default() -> Self {
        Preferences {
            default_agent: None,
            default_autonomy: default_autonomy(),
            default_build_mode: default_build_mode(),
            log_buffer_size: default_log_buffer_size(),
            max_parallel_agents: default_max_parallel_agents(),
            agent_paths: Vec::new(),
            theme_id: default_theme_id(),
            color_mode: default_color_mode(),
            theme: default_color_mode(),
            app_icon: default_app_icon(),
            prompt_overrides: HashMap::new(),
            has_seen_welcome_guide: false,
            has_accepted_disclaimer: false,
            outray: OutRayConfig::default(),
            build_notifications: default_build_notifications(),
            max_tokens_per_story: None,
            max_cost_per_build: None,
            warn_on_large_story: default_warn_on_large_story(),
            ideas_agent: None,
            prd_agent: None,
            specs_agent: None,
            design_agent: None,
        }
    }
}

// ============================================================================
// Duration Tracking Models
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RecentThreadDuration {
    pub thread_id: Option<String>,
    pub duration_ms: i64,
}
