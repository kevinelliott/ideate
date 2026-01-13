import { useCallback, useEffect, useRef, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { listen, UnlistenFn } from '@tauri-apps/api/event'
import { usePromptStore } from '../stores/promptStore'
import { useProcessStore } from '../stores/processStore'

interface DevServerConfig {
  command: string
  args: string[]
  url: string
  framework?: string
}

interface SpawnAgentResult {
  process_id: string
}

interface AgentOutputEvent {
  process_id: string
  stream_type: string
  content: string
}

interface AgentExitEvent {
  process_id: string
  exit_code: number | null
  success: boolean
}

export type DevServerStatus = 'idle' | 'detecting' | 'starting' | 'running' | 'stopping' | 'stopped' | 'error'

async function detectDevServerFromPackage(projectPath: string): Promise<DevServerConfig | null> {
  try {
    const packageJsonPath = `${projectPath}/package.json`
    const content = await invoke<string>('read_file', { path: packageJsonPath })
    const packageJson = JSON.parse(content)
    
    const scripts = packageJson.scripts || {}
    
    const devScripts = ['dev', 'start', 'serve', 'develop']
    let devScript: string | null = null
    let devCommand: string | null = null
    
    for (const script of devScripts) {
      if (scripts[script]) {
        devScript = script
        devCommand = scripts[script]
        break
      }
    }
    
    if (!devScript || !devCommand) {
      return null
    }
    
    let framework: string | undefined
    let port = 3000
    
    const deps = { ...packageJson.dependencies, ...packageJson.devDependencies }
    
    if (deps['next']) {
      framework = 'Next.js'
      port = 3000
    } else if (deps['vite']) {
      framework = 'Vite'
      port = 5173
    } else if (deps['@angular/core']) {
      framework = 'Angular'
      port = 4200
    } else if (deps['vue']) {
      framework = 'Vue'
      port = 5173
    } else if (deps['svelte'] || deps['@sveltejs/kit']) {
      framework = 'Svelte'
      port = 5173
    } else if (deps['react-scripts']) {
      framework = 'Create React App'
      port = 3000
    } else if (deps['gatsby']) {
      framework = 'Gatsby'
      port = 8000
    } else if (deps['nuxt']) {
      framework = 'Nuxt'
      port = 3000
    } else if (deps['astro']) {
      framework = 'Astro'
      port = 4321
    }
    
    const portMatch = devCommand.match(/(?:--port|PORT=|:)(\d+)/)
    if (portMatch) {
      port = parseInt(portMatch[1], 10)
    }
    
    let packageManager = 'npm'
    try {
      await invoke<string>('read_file', { path: `${projectPath}/pnpm-lock.yaml` })
      packageManager = 'pnpm'
    } catch {
      try {
        await invoke<string>('read_file', { path: `${projectPath}/yarn.lock` })
        packageManager = 'yarn'
      } catch {
        try {
          await invoke<string>('read_file', { path: `${projectPath}/bun.lockb` })
          packageManager = 'bun'
        } catch {
          // Default to npm
        }
      }
    }
    
    return {
      command: packageManager,
      args: packageManager === 'npm' ? ['run', devScript] : [devScript],
      url: `http://localhost:${port}`,
      framework,
    }
  } catch {
    return null
  }
}

export function useDevServer(projectPath: string, projectId?: string) {
  const [status, setStatus] = useState<DevServerStatus>('idle')
  const [config, setConfig] = useState<DevServerConfig | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [logs, setLogs] = useState<string[]>([])
  const [url, setUrl] = useState<string | null>(null)
  
  const serverProcessIdRef = useRef<string | null>(null)
  const detectProcessIdRef = useRef<string | null>(null)
  const detectOutputRef = useRef<string>('')
  const statusRef = useRef<DevServerStatus>('idle')
  const isDetectingRef = useRef(false)
  const unlistenOutputRef = useRef<UnlistenFn | null>(null)
  const unlistenExitRef = useRef<UnlistenFn | null>(null)
  
  const registerProcess = useProcessStore((state) => state.registerProcess)
  const unregisterProcess = useProcessStore((state) => state.unregisterProcess)
  const appendProcessLog = useProcessStore((state) => state.appendProcessLog)
  
  useEffect(() => {
    statusRef.current = status
  }, [status])

  useEffect(() => {
    let mounted = true
    
    const setupListeners = async () => {
      unlistenOutputRef.current = await listen<AgentOutputEvent>('agent-output', (event) => {
        if (!mounted) return
        
        if (event.payload.process_id === serverProcessIdRef.current) {
          setLogs((prev) => [...prev.slice(-100), event.payload.content])
          appendProcessLog(event.payload.process_id, event.payload.stream_type as 'stdout' | 'stderr', event.payload.content)
          
          // Detect URL from output
          const urlMatch = event.payload.content.match(/https?:\/\/localhost[:\d]*/i) ||
                          event.payload.content.match(/https?:\/\/127\.0\.0\.1[:\d]*/i) ||
                          event.payload.content.match(/https?:\/\/0\.0\.0\.0[:\d]*/i)
          if (urlMatch && statusRef.current === 'starting') {
            const detectedUrl = urlMatch[0].replace('0.0.0.0', 'localhost')
            setUrl(detectedUrl)
            setStatus('running')
          }
        } else if (event.payload.process_id === detectProcessIdRef.current) {
          detectOutputRef.current += event.payload.content + '\n'
          appendProcessLog(event.payload.process_id, event.payload.stream_type as 'stdout' | 'stderr', event.payload.content)
        }
      })
      
      unlistenExitRef.current = await listen<AgentExitEvent>('agent-exit', (event) => {
        if (!mounted) return
        
        if (event.payload.process_id === serverProcessIdRef.current) {
          if (projectId) {
            unregisterProcess(event.payload.process_id)
          }
          serverProcessIdRef.current = null
          setStatus('stopped')
          setUrl(null)
        } else if (event.payload.process_id === detectProcessIdRef.current) {
          if (projectId) {
            unregisterProcess(event.payload.process_id)
          }
          
          const output = detectOutputRef.current
          detectProcessIdRef.current = null
          isDetectingRef.current = false
          
          // Try to parse JSON from output
          const jsonMatch = output.match(/```json\s*([\s\S]*?)\s*```/) ||
                           output.match(/\{[\s\S]*"command"[\s\S]*\}/)
          if (jsonMatch) {
            try {
              const jsonStr = jsonMatch[1] || jsonMatch[0]
              const detected = JSON.parse(jsonStr) as DevServerConfig
              if (detected.command) {
                // Handle command that might be a full string like "pnpm dev"
                if (detected.command.includes(' ') && !detected.args?.length) {
                  const parts = detected.command.split(' ')
                  detected.command = parts[0]
                  detected.args = parts.slice(1)
                }
                setConfig(detected)
                setStatus('idle')
                return
              }
            } catch {
              // Fall through to error
            }
          }
          
          setError('Could not detect dev server configuration')
          setStatus('error')
        }
      })
    }
    
    setupListeners()
    
    return () => {
      mounted = false
      unlistenOutputRef.current?.()
      unlistenExitRef.current?.()
    }
  }, [projectId, unregisterProcess, appendProcessLog])

  const detectWithAmp = useCallback(async () => {
    if (!projectPath) return null
    
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
          command: {
            executable: 'amp',
            args: ['--execute', prompt],
            workingDirectory: projectPath,
          },
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
          command: {
            executable: config.command,
            args: config.args,
            workingDirectory: projectPath,
          },
        })
      }
      
      setTimeout(() => {
        if (serverProcessIdRef.current && statusRef.current === 'starting') {
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
      setStatus('stopped')
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
      if (detectProcessIdRef.current) {
        invoke('kill_agent', { processId: detectProcessIdRef.current }).catch(() => {})
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
