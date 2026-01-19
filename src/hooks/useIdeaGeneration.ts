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

interface StreamJsonMessage {
  type: string
  subtype?: string
  result?: string
  message?: {
    content?: Array<{
      type: string
      text?: string
    }>
  }
  // Claude Code format
  content?: string
}

function extractTextFromStreamJson(lines: string[]): string {
  // Look for the result message with subtype 'success' - this contains the final output
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed.startsWith('{')) continue
    
    try {
      const parsed: StreamJsonMessage = JSON.parse(trimmed)
      
      // Amp format: result message with subtype 'success' contains the final text
      if (parsed.type === 'result' && parsed.subtype === 'success' && parsed.result) {
        return parsed.result
      }
    } catch {
      // Not JSON, skip
    }
  }
  
  // Fallback: collect text from assistant messages if no result found
  const textParts: string[] = []
  
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed.startsWith('{')) continue
    
    try {
      const parsed: StreamJsonMessage = JSON.parse(trimmed)
      
      // Amp format: assistant message with content array
      if (parsed.type === 'assistant' && parsed.message?.content) {
        for (const item of parsed.message.content) {
          if (item.type === 'text' && item.text) {
            textParts.push(item.text)
          }
        }
      }
      
      // Claude Code format: direct content field
      if (parsed.type === 'text' && parsed.content) {
        textParts.push(parsed.content)
      }
    } catch {
      // Not JSON, skip
    }
  }
  
  return textParts.join('')
}

function cleanAgentOutput(raw: string, lines: string[]): string {
  // First, try to extract text from streaming JSON format
  const streamJsonText = extractTextFromStreamJson(lines)
  if (streamJsonText.trim()) {
    return cleanText(streamJsonText)
  }
  
  // Fallback to cleaning raw output
  return cleanText(raw)
}

function cleanText(text: string): string {
  let output = text
  
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
    currentDescription: string,
    agentId?: string
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
      // Use specified agent or fall back to amp, then first available
      const plugin = agentId 
        ? defaultPlugins.find((p: AgentPlugin) => p.id === agentId) || defaultPlugins[0]
        : defaultPlugins.find((p: AgentPlugin) => p.id === 'amp') || defaultPlugins[0]

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
      const cleanedOutput = cleanAgentOutput(output, lines)
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
