/**
 * Legacy plugin types - kept for backward compatibility.
 * New code should use types from ./agents.ts
 */

export type WorkingDirBehavior = 'project' | 'custom'

export interface AgentPlugin {
  id: string
  name: string
  command: string
  argsTemplate: string[]
  workingDir: WorkingDirBehavior
}

// Re-export from agents.ts for new implementations
export { 
  BUILT_IN_AGENTS, 
  getAgentById, 
  getDefaultAgent,
  buildPrintArgs,
  type AgentPluginStatus,
  type AgentModel,
  type AgentCapability,
  type AgentStatus,
} from './agents'

// Legacy default plugins mapped from new agent system
export const defaultPlugins: AgentPlugin[] = [
  {
    id: 'claude-code',
    name: 'Claude Code',
    command: 'claude',
    argsTemplate: ['-p', '--output-format', 'stream-json', '{{prompt}}'],
    workingDir: 'project',
  },
  {
    id: 'amp',
    name: 'Amp',
    command: 'amp',
    argsTemplate: ['--execute', '{{prompt}}', '--stream-json'],
    workingDir: 'project',
  },
  {
    id: 'opencode',
    name: 'OpenCode',
    command: 'opencode',
    argsTemplate: ['run', '{{prompt}}'],
    workingDir: 'project',
  },
  {
    id: 'droid',
    name: 'Droid',
    command: 'droid',
    argsTemplate: ['{{prompt}}'],
    workingDir: 'project',
  },
  {
    id: 'codex',
    name: 'Codex',
    command: 'codex',
    argsTemplate: ['exec', '{{prompt}}'],
    workingDir: 'project',
  },
  {
    id: 'cursor',
    name: 'Cursor Agent',
    command: 'agent',
    argsTemplate: ['-p', '{{prompt}}'],
    workingDir: 'project',
  },
  {
    id: 'continue',
    name: 'Continue',
    command: 'cn',
    argsTemplate: ['-p', '{{prompt}}'],
    workingDir: 'project',
  },
  {
    id: 'copilot',
    name: 'GitHub Copilot',
    command: 'copilot',
    argsTemplate: ['{{prompt}}'],
    workingDir: 'project',
  },
]
