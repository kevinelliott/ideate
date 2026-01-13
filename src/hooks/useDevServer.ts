import { useCallback, useEffect, useRef, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import { detectDevServer as detectDevServerFromPackage, type DevServerConfig } from '../utils/devServerDetection'
import { usePromptStore } from '../stores/promptStore'
import { useProcessStore } from '../stores/processStore'

interface SpawnAgentResult {
  process_id: string
}

interface AgentOutputEvent {
  process_id: string
  stream_type: 'stdout' | 'stderr'
  content: string
}

interface AgentExitEvent {
  process_id: string
  exit_code: number | null
  success: boolean
}

export type DevServerStatus = 'idle' | 'detecting' | 'starting' | 'running' | 'stopping' | 'error'

export function useDevServer(projectPath: string, projectId?: string) {
  const [status, setStatus] = useState<DevServerStatus>('idle')
  const [config, setConfig] = useState<DevServerConfig | null>(null)
  const [url, setUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [logs, setLogs] = useState<string[]>([])
  
  const serverProcessIdRef = useRef<string | null>(null)
  const detectProcessIdRef = useRef<string | null>(null)
  const unlistenOutputRef = useRef<UnlistenFn | null>(null)
  const unlistenExitRef = useRef<UnlistenFn | null>(null)
  const detectOutputRef = useRef<string>('')
  const isDetectingRef = useRef(false)
  const statusRef = useRef<DevServerStatus>('idle')

  const registerProcess = useProcessStore((state) => state.registerProcess)
  const unregisterProcess = useProcessStore((state) => state.unregisterProcess)
  const appendProcessLog = useProcessStore((state) => state.appendProcessLog)

  // Keep statusRef in sync
  useEffect(() => {
    statusRef.current = status
  }, [status])

  const parseDetectionOutput = useCallback((output: string) => {
    try {
      const jsonMatch = output.match(/\{[\s\S]*"command"[\s\S]*\}/m)
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0])
        if (parsed.command && parsed.url) {
          const parts = parsed.command.split(' ')
          const command = parts[0]
          const args = parts.slice(1)
          
          setConfig({
            command,
            args,
            url: parsed.url
          })
          setStatus('idle')
          return
        }
      }
      
      const commandMatch = output.match(/(?:npm run|pnpm|yarn|bun)\s+(?:dev|start|serve)/i)
      const portMatch = output.match(/(?:localhost|127\.0\.0\.1):(\d+)/i)
      
      if (commandMatch) {
        const fullCommand = commandMatch[0]
        const parts = fullCommand.split(' ')
        setConfig({
          command: parts[0],
          args: parts.slice(1),
          url: portMatch ? `http://localhost:${portMatch[1]}` : 'http://localhost:3000'
        })
        setStatus('idle')
        return
      }
      
      setError('Could not detect dev server configuration')
      setStatus('error')
    } catch (e) {
      setError('Failed to parse dev server configuration')
      setStatus('error')
    }
  }, [])

  // Set up event listeners once on mount
  useEffect(() => {
    let mounted = true

    const setupListeners = async () => {
      unlistenOutputRef.current = await listen<AgentOutputEvent>('agent-output', (event) => {
        if (!mounted) return
        
        if (event.payload.process_id === detectProcessIdRef.current) {
          detectOutputRef.current += event.payload.content + '\n'
          // Write to process store for visibility in AgentRunView
          appendProcessLog(
            event.payload.process_id,
            event.payload.stream_type,
            event.payload.content
          )
        }
        
        if (event.payload.process_id === serverProcessIdRef.current) {
          setLogs(prev => [...prev.slice(-100), event.payload.content])
          // Write to process store for visibility in AgentRunView
          appendProcessLog(
            event.payload.process_id,
            event.payload.stream_type,
            event.payload.content
          )
          
          const urlMatch = event.payload.content.match(/https?:\/\/localhost[:\d]*/i) ||
                          event.payload.content.match(/https?:\/\/127\.0\.0\.1[:\d]*/i) ||
                          event.payload.content.match(/https?:\/\/0\.0\.0\.0[:\d]*/i)
          if (urlMatch && statusRef.current === 'starting') {
            const detectedUrl = urlMatch[0].replace('0.0.0.0', 'localhost')
            setUrl(detectedUrl)
            setStatus('running')
          }
        }
      })

      unlistenExitRef.current = await listen<AgentExitEvent>('agent-exit', (event) => {
        if (!mounted) return
        
        if (event.payload.process_id === detectProcessIdRef.current) {
          if (projectId) {
            unregisterProcess(event.payload.process_id)
          }
          // Add system log for exit
          appendProcessLog(
            event.payload.process_id,
            'system',
            event.payload.success 
              ? `Detection completed (exit code: ${event.payload.exit_code ?? 0})`
              : `Detection failed (exit code: ${event.payload.exit_code ?? 'unknown'})`
          )
          detectProcessIdRef.current = null
          isDetectingRef.current = false
          parseDetectionOutput(detectOutputRef.current)
        }
        
        if (event.payload.process_id === serverProcessIdRef.current) {
          if (projectId) {
            unregisterProcess(event.payload.process_id)
          }
          // Add system log for exit
          appendProcessLog(
            event.payload.process_id,
            'system',
            event.payload.success 
              ? `Server stopped (exit code: ${event.payload.exit_code ?? 0})`
              : `Server crashed (exit code: ${event.payload.exit_code ?? 'unknown'})`
          )
          serverProcessIdRef.current = null
          setStatus('idle')
          setUrl(null)
        }
      })
    }

    setupListeners()

    return () => {
      mounted = false
      unlistenOutputRef.current?.()
      unlistenExitRef.current?.()
    }
  }, [projectId, unregisterProcess, parseDetectionOutput, appendProcessLog])

  const detectWithAmp = useCallback(async (): Promise<DevServerConfig | null> => {
    // Prevent multiple concurrent detections
    if (isDetectingRef.current || detectProcessIdRef.current) {
      return null
    }
    
    isDetectingRef.current = true
    detectOutputRef.current = ''
    
    const prompt = usePromptStore.getState().getPrompt('devServerDetection')

    try {
      const result = await invoke<SpawnAgentResult>('spawn_agent', {
        executable: 'amp',
        args: ['--execute', prompt],
        workingDirectory: projectPath,
      })
      
      detectProcessIdRef.current = result.process_id
      
      if (projectId) {
        registerProcess({
          processId: result.process_id,
          projectId,
          type: 'detection',
          label: 'Detecting dev server',
        })
      }
      
      await invoke('wait_agent', { processId: result.process_id })
      
      return null
    } catch (e) {
      isDetectingRef.current = false
      throw new Error(`Failed to detect dev server: ${e}`)
    }
  }, [projectPath, projectId, registerProcess])

  const detectDevServer = useCallback(async () => {
    // Use ref to prevent race conditions with React state updates
    if (statusRef.current === 'detecting' || isDetectingRef.current) return
    
    setStatus('detecting')
    setError(null)
    
    try {
      const detected = await detectDevServerFromPackage(projectPath)
      
      if (detected) {
        setConfig(detected)
        setStatus('idle')
        return
      }
      
      await detectWithAmp()
    } catch (e) {
      setError(`Failed to detect dev server: ${e}`)
      setStatus('error')
      isDetectingRef.current = false
    }
  }, [projectPath, detectWithAmp])

  const startServer = useCallback(async () => {
    if (!config || status === 'running' || status === 'starting') return
    
    setStatus('starting')
    setError(null)
    setLogs([])
    
    setUrl(config.url)
    
    try {
      const result = await invoke<SpawnAgentResult>('spawn_agent', {
        executable: config.command,
        args: config.args,
        workingDirectory: projectPath,
      })
      
      serverProcessIdRef.current = result.process_id

      if (projectId) {
        registerProcess({
          processId: result.process_id,
          projectId,
          type: 'dev-server',
          label: config.framework ? `Dev Server (${config.framework})` : 'Dev Server',
        })
      }
      
      setTimeout(() => {
        if (serverProcessIdRef.current) {
          setStatus('running')
        }
      }, 3000)
      
    } catch (e) {
      setError(`Failed to start dev server: ${e}`)
      setStatus('error')
    }
  }, [config, projectPath, status, projectId, registerProcess])

  const stopServer = useCallback(async () => {
    if (!serverProcessIdRef.current) return
    
    setStatus('stopping')
    
    try {
      const processId = serverProcessIdRef.current
      await invoke('kill_agent', { processId })
      if (projectId) {
        unregisterProcess(processId)
      }
      serverProcessIdRef.current = null
      setStatus('idle')
      setUrl(null)
    } catch (e) {
      setError(`Failed to stop dev server: ${e}`)
      setStatus('error')
    }
  }, [projectId, unregisterProcess])

  const toggleServer = useCallback(async () => {
    if (status === 'running' || status === 'starting') {
      await stopServer()
    } else if (config) {
      await startServer()
    } else {
      await detectDevServer()
    }
  }, [status, config, startServer, stopServer, detectDevServer])

  useEffect(() => {
    return () => {
      if (serverProcessIdRef.current) {
        const processId = serverProcessIdRef.current
        invoke('kill_agent', { processId }).catch(() => {})
        if (projectId) {
          unregisterProcess(processId)
        }
      }
    }
  }, [projectId, unregisterProcess])

  return {
    status,
    config,
    url,
    error,
    logs,
    detectDevServer,
    startServer,
    stopServer,
    toggleServer,
  }
}
