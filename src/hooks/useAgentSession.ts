import { useCallback, useEffect, useRef } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import { useAgentStore } from '../stores/agentStore'
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
  const getSession = useAgentStore((state) => state.getSession)
  const setProcessId = useAgentStore((state) => state.setProcessId)
  const setIsRunning = useAgentStore((state) => state.setIsRunning)
  const setAgentId = useAgentStore((state) => state.setAgentId)
  const addMessage = useAgentStore((state) => state.addMessage)
  const appendToLastMessage = useAgentStore((state) => state.appendToLastMessage)

  const registerProcess = useProcessStore((state) => state.registerProcess)
  const unregisterProcess = useProcessStore((state) => state.unregisterProcess)

  const session = getSession(projectId)
  const currentProcessIdRef = useRef<string | null>(null)
  const unlistenOutputRef = useRef<UnlistenFn | null>(null)
  const unlistenExitRef = useRef<UnlistenFn | null>(null)

  useEffect(() => {
    let mounted = true

    const setupListeners = async () => {
      unlistenOutputRef.current = await listen<AgentOutputEvent>('agent-output', (event) => {
        if (!mounted) return
        if (event.payload.processId === currentProcessIdRef.current) {
          appendToLastMessage(projectId, event.payload.content + '\n')
          onOutput(event.payload.content, event.payload.streamType)
        }
      })

      unlistenExitRef.current = await listen<AgentExitEvent>('agent-exit', (event) => {
        if (!mounted) return
        if (event.payload.processId === currentProcessIdRef.current) {
          unregisterProcess(event.payload.processId, event.payload.exitCode, event.payload.success)
          currentProcessIdRef.current = null
          setProcessId(projectId, null)
          setIsRunning(projectId, false)
          onExit(event.payload.success, event.payload.exitCode)
        }
      })
    }

    setupListeners()

    return () => {
      mounted = false
      unlistenOutputRef.current?.()
      unlistenExitRef.current?.()
    }
  }, [projectId, onOutput, onExit, setProcessId, setIsRunning, appendToLastMessage, unregisterProcess])

  const sendMessage = useCallback(async (message: string) => {
    const currentSession = useAgentStore.getState().getSession(projectId)
    const agentId = currentSession.agentId || 'amp'
    const plugin = defaultPlugins.find((p) => p.id === agentId) || defaultPlugins[0]

    const conversationContext = currentSession.messages
      .filter((m) => m.content.trim() !== '')
      .map((m) => {
        if (m.role === 'user') return `User: ${m.content}`
        if (m.role === 'agent') return `Agent: ${m.content}`
        return m.content
      })
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
      }).catch((error) => {
        console.error('Error waiting for agent:', error)
        unregisterProcess(result.processId, null, false)
        setIsRunning(projectId, false)
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
