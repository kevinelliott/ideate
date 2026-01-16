import { useCallback, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { homeDir } from '@tauri-apps/api/path'
import { defaultPlugins, type AgentPlugin } from '../types'
import { usePromptStore } from '../stores/promptStore'
import { useProcessStore } from '../stores/processStore'

interface SpawnAgentResult {
  processId: string
}

interface WaitAgentResult {
  processId: string
  exitCode: number | null
  success: boolean
}

interface AgentOutputPayload {
  processId: string
  streamType: 'stdout' | 'stderr'
  content: string
}

type GenerationType = 'generate' | 'shorten' | 'lengthen' | 'simplify'

const PROMPT_IDS: Record<GenerationType, string> = {
  generate: 'ideaDescriptionGenerate',
  shorten: 'ideaDescriptionShorten',
  lengthen: 'ideaDescriptionLengthen',
  simplify: 'ideaDescriptionSimplify',
}

function cleanAgentOutput(raw: string): string {
  let output = raw
  
  // Remove ANSI escape codes (colors, cursor movement, etc.)
  output = output.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '')
  
  // Remove other control characters except newlines and tabs
  output = output.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, '')
  
  // Normalize line endings: convert \r\n and standalone \r to \n
  output = output.replace(/\r\n/g, '\n')
  output = output.replace(/\r/g, '\n')
  
  // Remove markdown code fences if present (common in agent responses)
  output = output.replace(/^```(?:markdown|md)?\s*\n/gm, '')
  output = output.replace(/\n```\s*$/gm, '')
  
  // Trim leading/trailing whitespace but preserve internal newlines
  output = output.trim()
  
  return output
}

export function useIdeaGeneration() {
  const [isGenerating, setIsGenerating] = useState(false)
  const [generationType, setGenerationType] = useState<GenerationType | null>(null)
  const getPrompt = usePromptStore((state) => state.getPrompt)
  const registerProcess = useProcessStore((state) => state.registerProcess)
  const unregisterProcess = useProcessStore((state) => state.unregisterProcess)

  const generateDescription = useCallback(async (
    type: GenerationType,
    title: string,
    summary: string,
    currentDescription: string
  ): Promise<string | null> => {
    if (type === 'generate' && !title.trim()) {
      return null
    }
    
    if (type !== 'generate' && !currentDescription.trim()) {
      return null
    }

    setIsGenerating(true)
    setGenerationType(type)

    try {
      const plugin = defaultPlugins.find((p: AgentPlugin) => p.id === 'amp') || defaultPlugins[0]

      if (!plugin) {
        throw new Error('No agent plugin configured')
      }

      const promptId = PROMPT_IDS[type] as keyof typeof import('../utils/prompts').DEFAULT_PROMPTS
      const prompt = getPrompt(promptId, {
        '{{title}}': title,
        '{{summary}}': summary,
        '{{description}}': currentDescription,
      })

      const args = plugin.argsTemplate.map((arg: string) =>
        arg.replace('{{prompt}}', prompt)
      )

      const workingDirectory = await homeDir()

      const spawnResult = await invoke<SpawnAgentResult>('spawn_agent', {
        executable: plugin.command,
        args,
        workingDirectory
      })

      // Register process so it appears in Process Viewer and can be stopped
      registerProcess({
        processId: spawnResult.processId,
        projectId: 'ideas', // Use 'ideas' as pseudo-project for idea generation
        type: 'prd',
        label: `Idea: ${type} description`,
        agentId: plugin.id,
        command: {
          executable: plugin.command,
          args,
          workingDirectory,
        },
      })

      const lines: string[] = []
      
      const unlistenOutput = await listen<AgentOutputPayload>('agent-output', (event) => {
        if (event.payload.processId === spawnResult.processId) {
          // Each event contains a line without its newline (stripped by BufReader.lines())
          // Collect lines separately to preserve structure
          lines.push(event.payload.content)
        }
      })

      const waitResult = await invoke<WaitAgentResult>('wait_agent', {
        processId: spawnResult.processId
      })

      unlistenOutput()
      unregisterProcess(spawnResult.processId, waitResult.exitCode, waitResult.success)

      if (!waitResult.success) {
        console.error('Agent failed with exit code:', waitResult.exitCode)
        return null
      }

      // Join lines with newlines to reconstruct the original output
      const output = lines.join('\n')
      const cleanedOutput = cleanAgentOutput(output)
      return cleanedOutput || null
    } catch (error) {
      console.error('Generation error:', error)
      return null
    } finally {
      setIsGenerating(false)
      setGenerationType(null)
    }
  }, [getPrompt, registerProcess, unregisterProcess])

  return {
    generateDescription,
    isGenerating,
    generationType,
  }
}
