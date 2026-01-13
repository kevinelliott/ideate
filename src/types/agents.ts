/**
 * Standardized Agent Plugin System
 * 
 * Supports multiple AI coding agent CLIs with consistent interface.
 */

export type WorkingDirBehavior = 'project' | 'custom'

export type AgentCapability = 
  | 'code-editing'
  | 'code-review'
  | 'chat'
  | 'autonomous'
  | 'multi-model'
  | 'mcp'
  | 'web-search'

export type AgentStatus = 'available' | 'not-installed' | 'unknown'

export interface AgentModel {
  id: string
  name: string
  provider?: string
}

export interface AgentPlugin {
  id: string
  name: string
  command: string
  versionCommand: string[]
  printArgs: string[]
  interactiveArgs: string[]
  defaultModel?: string
  supportedModels?: AgentModel[]
  capabilities: AgentCapability[]
  website: string
  description: string
}

export interface AgentPluginStatus extends AgentPlugin {
  status: AgentStatus
  installedVersion?: string
  cliPath?: string
}

/**
 * Built-in agent definitions based on research.
 * These represent the CLI configurations for each supported agent.
 */
export const BUILT_IN_AGENTS: AgentPlugin[] = [
  {
    id: 'claude-code',
    name: 'Claude Code',
    command: 'claude',
    versionCommand: ['-v'],
    printArgs: ['-p', '{{prompt}}'],
    interactiveArgs: [],
    defaultModel: 'sonnet',
    supportedModels: [
      { id: 'sonnet', name: 'Claude Sonnet', provider: 'Anthropic' },
      { id: 'opus', name: 'Claude Opus', provider: 'Anthropic' },
      { id: 'haiku', name: 'Claude Haiku', provider: 'Anthropic' },
      { id: 'opusplan', name: 'Opus Plan + Sonnet', provider: 'Anthropic' },
    ],
    capabilities: ['code-editing', 'code-review', 'chat', 'autonomous', 'mcp', 'web-search'],
    website: 'https://claude.ai/code',
    description: 'Anthropic\'s official agentic coding tool with deep integration for complex tasks.',
  },
  {
    id: 'amp',
    name: 'Amp',
    command: 'amp',
    versionCommand: ['--version'],
    printArgs: ['--execute', '{{prompt}}'],
    interactiveArgs: [],
    defaultModel: 'smart',
    supportedModels: [
      { id: 'smart', name: 'Smart Mode', provider: 'Multi-model' },
      { id: 'rush', name: 'Rush Mode', provider: 'Multi-model' },
    ],
    capabilities: ['code-editing', 'code-review', 'chat', 'autonomous', 'multi-model', 'mcp'],
    website: 'https://ampcode.com',
    description: 'Sourcegraph\'s frontier coding agent using multiple models for optimal results.',
  },
  {
    id: 'opencode',
    name: 'OpenCode',
    command: 'opencode',
    versionCommand: ['--version'],
    printArgs: ['run', '{{prompt}}'],
    interactiveArgs: [],
    defaultModel: undefined,
    supportedModels: [],
    capabilities: ['code-editing', 'code-review', 'chat', 'autonomous', 'multi-model', 'mcp'],
    website: 'https://opencode.ai',
    description: 'Open source AI coding agent with TUI, supporting multiple LLM providers.',
  },
  {
    id: 'droid',
    name: 'Droid',
    command: 'droid',
    versionCommand: ['--version'],
    printArgs: ['{{prompt}}'],
    interactiveArgs: [],
    defaultModel: undefined,
    supportedModels: [],
    capabilities: ['code-editing', 'code-review', 'chat', 'autonomous', 'mcp'],
    website: 'https://factory.ai',
    description: 'Factory\'s enterprise development agent with spec mode and GitHub integration.',
  },
  {
    id: 'codex',
    name: 'Codex',
    command: 'codex',
    versionCommand: ['--version'],
    printArgs: ['exec', '{{prompt}}'],
    interactiveArgs: [],
    defaultModel: undefined,
    supportedModels: [],
    capabilities: ['code-editing', 'code-review', 'chat', 'autonomous', 'mcp'],
    website: 'https://openai.com/codex',
    description: 'OpenAI\'s coding agent with sandboxed execution and structured outputs.',
  },
  {
    id: 'cursor',
    name: 'Cursor Agent',
    command: 'agent',
    versionCommand: ['--version'],
    printArgs: ['-p', '{{prompt}}'],
    interactiveArgs: [],
    defaultModel: undefined,
    supportedModels: [],
    capabilities: ['code-editing', 'code-review', 'chat', 'autonomous'],
    website: 'https://cursor.com',
    description: 'Cursor\'s CLI agent for coding assistance from the terminal.',
  },
  {
    id: 'continue',
    name: 'Continue',
    command: 'cn',
    versionCommand: ['--version'],
    printArgs: ['-p', '{{prompt}}'],
    interactiveArgs: [],
    defaultModel: undefined,
    supportedModels: [],
    capabilities: ['code-editing', 'code-review', 'chat', 'autonomous', 'multi-model', 'mcp'],
    website: 'https://continue.dev',
    description: 'Open source modular coding agent with customizable models, rules, and tools.',
  },
  {
    id: 'copilot',
    name: 'GitHub Copilot',
    command: 'copilot',
    versionCommand: ['--version'],
    printArgs: ['{{prompt}}'],
    interactiveArgs: [],
    defaultModel: undefined,
    supportedModels: [],
    capabilities: ['code-editing', 'code-review', 'chat', 'autonomous', 'mcp'],
    website: 'https://github.com/features/copilot',
    description: 'GitHub\'s AI coding assistant with deep repository integration.',
  },
]

/**
 * Get agent by ID
 */
export function getAgentById(id: string): AgentPlugin | undefined {
  return BUILT_IN_AGENTS.find(agent => agent.id === id)
}

/**
 * Get default agent (Claude Code)
 */
export function getDefaultAgent(): AgentPlugin {
  return BUILT_IN_AGENTS.find(agent => agent.id === 'claude-code') || BUILT_IN_AGENTS[0]
}

/**
 * Build command args for print mode execution
 */
export function buildPrintArgs(agent: AgentPlugin, prompt: string, model?: string): string[] {
  const args = agent.printArgs.map(arg => 
    arg.replace('{{prompt}}', prompt)
  )
  
  if (model && agent.supportedModels?.length) {
    args.unshift('--model', model)
  }
  
  return args
}
