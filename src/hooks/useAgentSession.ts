import { useCallback, useEffect, useRef } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import { useAgentStore, type AgentSession } from '../stores/agentStore'
import { useProcessStore } from '../stores/processStore'
import { defaultPlugins } from '../types'

interface SpawnAgentResult {
  processId: string
}

interface WaitAgentResult {
  processId: string
  exitCode: number | null
  success: boolean
}

interface AgentOutputEvent {
  processId: string
  streamType: 'stdout' | 'stderr'
  content: string
}

interface AgentExitEvent {
  processId: string
  exitCode: number | null
  success: boolean
}

export function useAgentSession(
  projectId: string,
  projectPath: string,
  onOutput: (content: string, streamType: 'stdout' | 'stderr') => void,
  onExit: (success: boolean, exitCode: number | null) => void
) {
  // Subscribe directly to the session state for this projectId to ensure reactivity
  // We need to subscribe to the sessions object and extract the session for this projectId
  const defaultAgentId = useAgentStore((state) => state.defaultAgentId)
  const storedSession = useAgentStore((state) => state.sessions[projectId])
  
  // Create a stable session object with defaults
  const session: AgentSession = storedSession ?? {
    processId: null,
    isRunning: false,
    messages: [],
    agentId: defaultAgentId,
  }
  const setProcessId = useAgentStore((state) => state.setProcessId)
  const setIsRunning = useAgentStore((state) => state.setIsRunning)
  const setAgentId = useAgentStore((state) => state.setAgentId)
  const addMessage = useAgentStore((state) => state.addMessage)
  const appendToLastMessage = useAgentStore((state) => state.appendToLastMessage)

  const registerProcess = useProcessStore((state) => state.registerProcess)
  const unregisterProcess = useProcessStore((state) => state.unregisterProcess)
  const currentProcessIdRef = useRef<string | null>(null)
  const unlistenOutputRef = useRef<UnlistenFn | null>(null)
  const unlistenExitRef = useRef<UnlistenFn | null>(null)
  
  // Use refs for callbacks to avoid re-subscribing to events when callbacks change
  const onOutputRef = useRef(onOutput)
  const onExitRef = useRef(onExit)
  
  // Keep refs updated with latest callbacks
  useEffect(() => {
    onOutputRef.current = onOutput
  }, [onOutput])
  
  useEffect(() => {
    onExitRef.current = onExit
  }, [onExit])

  useEffect(() => {
    let mounted = true

    const setupListeners = async () => {
      unlistenOutputRef.current = await listen<AgentOutputEvent>('agent-output', (event) => {
        if (!mounted) return
        if (event.payload.processId === currentProcessIdRef.current) {
          appendToLastMessage(projectId, event.payload.content + '\n')
          onOutputRef.current(event.payload.content, event.payload.streamType)
        }
      })

      unlistenExitRef.current = await listen<AgentExitEvent>('agent-exit', (event) => {
        if (!mounted) return
        if (event.payload.processId === currentProcessIdRef.current) {
          unregisterProcess(event.payload.processId, event.payload.exitCode, event.payload.success)
          currentProcessIdRef.current = null
          setProcessId(projectId, null)
          setIsRunning(projectId, false)
          onExitRef.current(event.payload.success, event.payload.exitCode)
        }
      })
    }

    setupListeners()

    return () => {
      mounted = false
      unlistenOutputRef.current?.()
      unlistenExitRef.current?.()
    }
  }, [projectId, setProcessId, setIsRunning, appendToLastMessage, unregisterProcess])

  const sendMessage = useCallback(async (message: string) => {
    const currentSession = useAgentStore.getState().getSession(projectId)
    const defaultAgentId = useAgentStore.getState().defaultAgentId
    const agentId = currentSession.agentId || defaultAgentId
    const plugin = defaultPlugins.find((p) => p.id === agentId) || defaultPlugins[0]

    // Build conversation context with limits to avoid "prompt too long" errors
    // Only include recent user messages and brief summaries of agent responses
    const MAX_CONTEXT_MESSAGES = 6 // Last 3 exchanges (user + agent pairs)
    const MAX_USER_MESSAGE_LENGTH = 500
    const MAX_AGENT_SUMMARY_LENGTH = 200
    
    const relevantMessages = currentSession.messages
      .filter((m) => m.role === 'user' || m.role === 'agent')
      .filter((m) => m.content.trim() !== '')
      .slice(-MAX_CONTEXT_MESSAGES)
    
    const conversationContext = relevantMessages
      .map((m) => {
        if (m.role === 'user') {
          const content = m.content.length > MAX_USER_MESSAGE_LENGTH 
            ? m.content.substring(0, MAX_USER_MESSAGE_LENGTH) + '...'
            : m.content
          return `User: ${content}`
        }
        if (m.role === 'agent') {
          // Extract just text content from agent messages, skip JSON metadata
          // Try to find actual text responses, not raw JSON
          let summary = ''
          const lines = m.content.split('\n')
          for (const line of lines) {
            const trimmed = line.trim()
            // Skip JSON lines
            if (trimmed.startsWith('{') && trimmed.endsWith('}')) continue
            // Skip empty lines
            if (!trimmed) continue
            // Accumulate non-JSON content
            if (summary.length < MAX_AGENT_SUMMARY_LENGTH) {
              summary += (summary ? ' ' : '') + trimmed
            }
          }
          // If no text content found, just indicate agent responded
          if (!summary) {
            summary = '[Agent responded with tool operations]'
          } else if (summary.length > MAX_AGENT_SUMMARY_LENGTH) {
            summary = summary.substring(0, MAX_AGENT_SUMMARY_LENGTH) + '...'
          }
          return `Agent: ${summary}`
        }
        return ''
      })
      .filter(Boolean)
      .join('\n\n')

    const fullPrompt = conversationContext
      ? `${conversationContext}\n\nUser: ${message}\n\nPlease respond to the user's latest message above.`
      : message

    addMessage(projectId, { role: 'user', content: message })
    addMessage(projectId, { role: 'agent', content: '' })

    setIsRunning(projectId, true)

    try {
      const args = plugin.argsTemplate.map((arg) =>
        arg.replace('{{prompt}}', fullPrompt)
      )

      const result = await invoke<SpawnAgentResult>('spawn_agent', {
        executable: plugin.command,
        args,
        workingDirectory: projectPath,
      })

      currentProcessIdRef.current = result.processId
      setProcessId(projectId, result.processId)

      registerProcess({
        processId: result.processId,
        projectId,
        type: 'chat',
        label: `Chat with ${plugin.name}`,
        agentId: plugin.id,
        command: {
          executable: plugin.command,
          args,
          workingDirectory: projectPath,
        },
      })

      invoke<WaitAgentResult>('wait_agent', {
        processId: result.processId,
      }).then((waitResult) => {
        // Ensure state is reset when wait_agent completes
        // This is a fallback in case the agent-exit event was missed
        if (currentProcessIdRef.current === result.processId) {
          unregisterProcess(result.processId, waitResult.exitCode, waitResult.success)
          currentProcessIdRef.current = null
          setProcessId(projectId, null)
          setIsRunning(projectId, false)
          onExitRef.current(waitResult.success, waitResult.exitCode)
        }
      }).catch((error) => {
        console.error('Error waiting for agent:', error)
        if (currentProcessIdRef.current === result.processId) {
          unregisterProcess(result.processId, null, false)
          currentProcessIdRef.current = null
          setProcessId(projectId, null)
          setIsRunning(projectId, false)
        }
      })

    } catch (error) {
      console.error('Failed to spawn agent:', error)
      addMessage(projectId, { 
        role: 'system', 
        content: `Error: Failed to start agent - ${error}` 
      })
      setIsRunning(projectId, false)
    }
  }, [projectId, projectPath, addMessage, setProcessId, setIsRunning, registerProcess, unregisterProcess])

  const cancelSession = useCallback(async () => {
    const processId = currentProcessIdRef.current
    if (processId) {
      try {
        await invoke('kill_agent', { processId: processId })
        unregisterProcess(processId, null, false)
        currentProcessIdRef.current = null
        setProcessId(projectId, null)
        setIsRunning(projectId, false)
        addMessage(projectId, { role: 'system', content: '⚠ Agent cancelled' })
      } catch (error) {
        console.error('Failed to kill agent:', error)
      }
    }
  }, [projectId, setProcessId, setIsRunning, addMessage, unregisterProcess])

  const changeAgent = useCallback((agentId: string) => {
    setAgentId(projectId, agentId)
  }, [projectId, setAgentId])

  return {
    session,
    sendMessage,
    cancelSession,
    changeAgent,
  }
}
