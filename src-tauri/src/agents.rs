//! Agent plugin definitions and detection.

use std::process::Command;

use crate::models::{AgentModel, AgentPlugin, AgentPluginStatus};

/// Returns the list of built-in agent definitions.
pub fn get_built_in_agents() -> Vec<AgentPlugin> {
    vec![
        AgentPlugin {
            id: "claude-code".to_string(),
            name: "Claude Code".to_string(),
            command: "claude".to_string(),
            version_command: vec!["-v".to_string()],
            print_args: vec!["-p".to_string(), "{{prompt}}".to_string()],
            interactive_args: vec![],
            default_model: Some("sonnet".to_string()),
            supported_models: vec![
                AgentModel {
                    id: "sonnet".to_string(),
                    name: "Claude Sonnet".to_string(),
                    provider: Some("Anthropic".to_string()),
                },
                AgentModel {
                    id: "opus".to_string(),
                    name: "Claude Opus".to_string(),
                    provider: Some("Anthropic".to_string()),
                },
                AgentModel {
                    id: "haiku".to_string(),
                    name: "Claude Haiku".to_string(),
                    provider: Some("Anthropic".to_string()),
                },
                AgentModel {
                    id: "opusplan".to_string(),
                    name: "Opus Plan + Sonnet".to_string(),
                    provider: Some("Anthropic".to_string()),
                },
            ],
            capabilities: vec![
                "code-editing".to_string(),
                "code-review".to_string(),
                "chat".to_string(),
                "autonomous".to_string(),
                "mcp".to_string(),
                "web-search".to_string(),
            ],
            website: "https://claude.ai/code".to_string(),
            description: "Anthropic's official agentic coding tool with deep integration for complex tasks.".to_string(),
        },
        AgentPlugin {
            id: "amp".to_string(),
            name: "Amp".to_string(),
            command: "amp".to_string(),
            version_command: vec!["--version".to_string()],
            print_args: vec!["--execute".to_string(), "{{prompt}}".to_string()],
            interactive_args: vec![],
            default_model: Some("smart".to_string()),
            supported_models: vec![
                AgentModel {
                    id: "smart".to_string(),
                    name: "Smart Mode".to_string(),
                    provider: Some("Multi-model".to_string()),
                },
                AgentModel {
                    id: "rush".to_string(),
                    name: "Rush Mode".to_string(),
                    provider: Some("Multi-model".to_string()),
                },
            ],
            capabilities: vec![
                "code-editing".to_string(),
                "code-review".to_string(),
                "chat".to_string(),
                "autonomous".to_string(),
                "multi-model".to_string(),
                "mcp".to_string(),
            ],
            website: "https://ampcode.com".to_string(),
            description: "Sourcegraph's frontier coding agent using multiple models for optimal results.".to_string(),
        },
        AgentPlugin {
            id: "opencode".to_string(),
            name: "OpenCode".to_string(),
            command: "opencode".to_string(),
            version_command: vec!["--version".to_string()],
            print_args: vec!["run".to_string(), "{{prompt}}".to_string()],
            interactive_args: vec![],
            default_model: None,
            supported_models: vec![],
            capabilities: vec![
                "code-editing".to_string(),
                "code-review".to_string(),
                "chat".to_string(),
                "autonomous".to_string(),
                "multi-model".to_string(),
                "mcp".to_string(),
            ],
            website: "https://opencode.ai".to_string(),
            description: "Open source AI coding agent with TUI, supporting multiple LLM providers.".to_string(),
        },
        AgentPlugin {
            id: "droid".to_string(),
            name: "Droid".to_string(),
            command: "droid".to_string(),
            version_command: vec!["--version".to_string()],
            print_args: vec!["{{prompt}}".to_string()],
            interactive_args: vec![],
            default_model: None,
            supported_models: vec![],
            capabilities: vec![
                "code-editing".to_string(),
                "code-review".to_string(),
                "chat".to_string(),
                "autonomous".to_string(),
                "mcp".to_string(),
            ],
            website: "https://factory.ai".to_string(),
            description: "Factory's enterprise development agent with spec mode and GitHub integration.".to_string(),
        },
        AgentPlugin {
            id: "codex".to_string(),
            name: "Codex".to_string(),
            command: "codex".to_string(),
            version_command: vec!["--version".to_string()],
            print_args: vec!["exec".to_string(), "{{prompt}}".to_string()],
            interactive_args: vec![],
            default_model: None,
            supported_models: vec![],
            capabilities: vec![
                "code-editing".to_string(),
                "code-review".to_string(),
                "chat".to_string(),
                "autonomous".to_string(),
                "mcp".to_string(),
            ],
            website: "https://openai.com/codex".to_string(),
            description: "OpenAI's coding agent with sandboxed execution and structured outputs.".to_string(),
        },
        AgentPlugin {
            id: "cursor".to_string(),
            name: "Cursor Agent".to_string(),
            command: "agent".to_string(),
            version_command: vec!["--version".to_string()],
            print_args: vec!["-p".to_string(), "{{prompt}}".to_string()],
            interactive_args: vec![],
            default_model: None,
            supported_models: vec![],
            capabilities: vec![
                "code-editing".to_string(),
                "code-review".to_string(),
                "chat".to_string(),
                "autonomous".to_string(),
            ],
            website: "https://cursor.com".to_string(),
            description: "Cursor's CLI agent for coding assistance from the terminal.".to_string(),
        },
        AgentPlugin {
            id: "continue".to_string(),
            name: "Continue".to_string(),
            command: "cn".to_string(),
            version_command: vec!["--version".to_string()],
            print_args: vec!["-p".to_string(), "{{prompt}}".to_string()],
            interactive_args: vec![],
            default_model: None,
            supported_models: vec![],
            capabilities: vec![
                "code-editing".to_string(),
                "code-review".to_string(),
                "chat".to_string(),
                "autonomous".to_string(),
                "multi-model".to_string(),
                "mcp".to_string(),
            ],
            website: "https://continue.dev".to_string(),
            description: "Open source modular coding agent with customizable models, rules, and tools.".to_string(),
        },
        AgentPlugin {
            id: "copilot".to_string(),
            name: "GitHub Copilot".to_string(),
            command: "copilot".to_string(),
            version_command: vec!["--version".to_string()],
            print_args: vec!["{{prompt}}".to_string()],
            interactive_args: vec![],
            default_model: None,
            supported_models: vec![],
            capabilities: vec![
                "code-editing".to_string(),
                "code-review".to_string(),
                "chat".to_string(),
                "autonomous".to_string(),
                "mcp".to_string(),
            ],
            website: "https://github.com/features/copilot".to_string(),
            description: "GitHub's AI coding assistant with deep repository integration.".to_string(),
        },
    ]
}

/// Detects the installation status of an agent.
fn detect_agent_status(agent: &AgentPlugin) -> AgentPluginStatus {
    let (status, installed_version, cli_path) = match Command::new("which")
        .arg(&agent.command)
        .output()
    {
        Ok(output) if output.status.success() => {
            let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
            
            // Try to get version
            let version = if !agent.version_command.is_empty() {
                Command::new(&agent.command)
                    .args(&agent.version_command)
                    .output()
                    .ok()
                    .and_then(|v| {
                        if v.status.success() {
                            let ver = String::from_utf8_lossy(&v.stdout).trim().to_string();
                            if ver.is_empty() {
                                String::from_utf8_lossy(&v.stderr)
                                    .trim()
                                    .to_string()
                                    .lines()
                                    .next()
                                    .map(|s| s.to_string())
                            } else {
                                ver.lines().next().map(|s| s.to_string())
                            }
                        } else {
                            None
                        }
                    })
            } else {
                None
            };
            
            ("available".to_string(), version, Some(path))
        }
        _ => ("not-installed".to_string(), None, None),
    };
    
    AgentPluginStatus {
        agent: agent.clone(),
        status,
        installed_version,
        cli_path,
    }
}

/// Returns the list of all built-in agents.
#[tauri::command]
pub fn list_agents() -> Result<Vec<AgentPlugin>, String> {
    Ok(get_built_in_agents())
}

/// Detects which agents are installed and their versions.
#[tauri::command]
pub async fn detect_agents() -> Result<Vec<AgentPluginStatus>, String> {
    tokio::task::spawn_blocking(|| {
        let agents = get_built_in_agents();
        agents.iter().map(detect_agent_status).collect()
    })
    .await
    .map_err(|e| format!("Failed to detect agents: {}", e))
}
