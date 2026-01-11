import { useCallback } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { usePrdStore } from '../stores/prdStore'
import { useBuildStore } from '../stores/buildStore'
import { defaultPlugins, type AgentPlugin } from '../types'

interface ProjectSettings {
  agent: string | null
  autonomy: string
}

interface SpawnAgentResult {
  process_id: string
}

interface WaitAgentResult {
  process_id: string
  exit_code: number | null
  success: boolean
}

interface Prd {
  project?: string
  branchName?: string
  description?: string
  userStories: Array<{
    id: string
    title: string
    description: string
    acceptanceCriteria: string[]
    priority: number
    passes: boolean
    status?: string
    notes: string
  }>
}

function generatePrdPrompt(idea: string, projectName: string): string {
  return `You are a product manager. Generate a PRD (Product Requirements Document) for the following app idea.

PROJECT NAME: ${projectName}

IDEA:
${idea}

Generate a prd.json file in the .ideate/ folder with the following structure:
{
  "project": "${projectName}",
  "description": "Brief project description",
  "branchName": "main",
  "userStories": [
    {
      "id": "US-001",
      "title": "Story title",
      "description": "Detailed description of the user story",
      "acceptanceCriteria": ["AC1", "AC2", "AC3"],
      "priority": 1,
      "passes": false,
      "status": "pending",
      "notes": ""
    }
  ]
}

Requirements:
1. Create 5-10 user stories that cover the core functionality
2. Order stories by priority (1 = highest priority)
3. Each story should have 3-5 clear acceptance criteria
4. Stories should be small enough to implement in a single iteration
5. Include foundational setup stories first (project init, basic structure)
6. Write the prd.json to .ideate/prd.json

IMPORTANT: Only create the prd.json file. Do not implement any features.`
}

export function usePrdGeneration() {
  const setStatus = usePrdStore((state) => state.setStatus)
  const setStories = usePrdStore((state) => state.setStories)
  const appendLog = useBuildStore((state) => state.appendLog)
  const clearLogs = useBuildStore((state) => state.clearLogs)
  const setCurrentProcessId = useBuildStore((state) => state.setCurrentProcessId)

  const generatePrd = useCallback(async (
    idea: string,
    projectName: string,
    projectPath: string
  ): Promise<boolean> => {
    setStatus('generating')
    clearLogs()
    appendLog('system', `Starting PRD generation for "${projectName}"...`)

    try {
      const settings = await invoke<ProjectSettings | null>('load_project_settings', {
        projectPath
      })

      const agentId = settings?.agent || 'amp'
      const plugin = defaultPlugins.find((p: AgentPlugin) => p.id === agentId) || defaultPlugins[0]

      if (!plugin) {
        throw new Error('No agent plugin configured')
      }

      appendLog('system', `Using agent: ${plugin.name}`)

      const prompt = generatePrdPrompt(idea, projectName)

      const args = plugin.argsTemplate.map((arg: string) =>
        arg.replace('{{prompt}}', prompt)
      )

      appendLog('system', `Spawning ${plugin.command}...`)

      const spawnResult = await invoke<SpawnAgentResult>('spawn_agent', {
        executable: plugin.command,
        args,
        workingDirectory: projectPath
      })

      setCurrentProcessId(spawnResult.process_id)
      appendLog('system', `Agent started (process ID: ${spawnResult.process_id})`)

      const waitResult = await invoke<WaitAgentResult>('wait_agent', {
        processId: spawnResult.process_id
      })

      setCurrentProcessId(null)

      if (!waitResult.success) {
        appendLog('system', `Agent exited with error (code: ${waitResult.exit_code ?? 'unknown'})`)
        setStatus('error')
        return false
      }

      appendLog('system', 'Agent completed successfully. Loading generated PRD...')

      const prd = await invoke<Prd | null>('load_prd', {
        projectPath
      })

      if (prd && prd.userStories && prd.userStories.length > 0) {
        const stories = prd.userStories.map(story => ({
          id: story.id,
          title: story.title,
          description: story.description,
          acceptanceCriteria: story.acceptanceCriteria,
          priority: story.priority,
          passes: story.passes,
          notes: story.notes
        }))
        setStories(stories)
        setStatus('ready')
        appendLog('system', `PRD loaded with ${stories.length} user stories`)
        return true
      } else {
        appendLog('system', 'Warning: PRD file not found or empty after generation')
        setStatus('error')
        return false
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      appendLog('system', `Error: ${errorMessage}`)
      setStatus('error')
      return false
    }
  }, [setStatus, setStories, appendLog, clearLogs, setCurrentProcessId])

  return { generatePrd }
}
