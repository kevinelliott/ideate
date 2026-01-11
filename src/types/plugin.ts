export type WorkingDirBehavior = 'project' | 'custom'

export interface AgentPlugin {
  id: string
  name: string
  command: string
  argsTemplate: string[]
  workingDir: WorkingDirBehavior
}

export const defaultPlugins: AgentPlugin[] = [
  {
    id: 'amp',
    name: 'Amp',
    command: 'amp',
    argsTemplate: ['-p', '{{prompt}}'],
    workingDir: 'project',
  },
  {
    id: 'claude-code',
    name: 'Claude Code',
    command: 'claude',
    argsTemplate: ['-p', '{{prompt}}'],
    workingDir: 'project',
  },
]
