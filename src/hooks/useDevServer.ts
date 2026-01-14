import { useCallback, useEffect, useRef, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { listen, UnlistenFn } from '@tauri-apps/api/event'
import { readTextFile, exists } from '@tauri-apps/plugin-fs'
import { usePromptStore } from '../stores/promptStore'
import { useProcessStore } from '../stores/processStore'
import { notify } from '../utils/notify'

interface DevServerConfig {
  command: string
  args: string[]
  url: string
  framework?: string
  env?: Record<string, string>
}

interface SpawnAgentResult {
  processId: string
}

interface AgentOutputEvent {
  processId: string
  streamType: string
  content: string
}

interface AgentExitEvent {
  processId: string
  exitCode: number | null
  success: boolean
}

export type DevServerStatus = 'idle' | 'detecting' | 'starting' | 'running' | 'stopping' | 'stopped' | 'error'

// Track which projects have had their dev server manually stopped
// This persists across component remounts to prevent auto-restart
const manuallyStoppedProjects = new Set<string>()

async function detectDevServerFromPackage(projectPath: string): Promise<DevServerConfig | null> {
  try {
    const packageJsonPath = `${projectPath}/package.json`
    
    // Check if package.json exists first
    if (!await exists(packageJsonPath)) {
      return null
    }
    
    const content = await readTextFile(packageJsonPath)
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
    
    // Detect package manager by checking for lock files
    let packageManager = 'npm'
    if (await exists(`${projectPath}/pnpm-lock.yaml`)) {
      packageManager = 'pnpm'
    } else if (await exists(`${projectPath}/yarn.lock`)) {
      packageManager = 'yarn'
    } else if (await exists(`${projectPath}/bun.lockb`)) {
      packageManager = 'bun'
    }
    
    // Build args - for npm we need 'run' prefix
    const args = packageManager === 'npm' ? ['run', devScript] : [devScript]
    
    return {
      command: packageManager,
      args,
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
  const isStartingRef = useRef(false)
  const unlistenOutputRef = useRef<UnlistenFn | null>(null)
  const unlistenExitRef = useRef<UnlistenFn | null>(null)
  
  // Log batching to reduce UI pressure
  const logBufferRef = useRef<string[]>([])
  const logFlushTimeoutRef = useRef<number | null>(null)
  
  const registerProcess = useProcessStore((state) => state.registerProcess)
  const unregisterProcess = useProcessStore((state) => state.unregisterProcess)
  const getProcessesByType = useProcessStore((state) => state.getProcessesByType)
  const appendProcessLog = useProcessStore((state) => state.appendProcessLog)

  // Check for existing dev-server or detection process on mount
  useEffect(() => {
    if (!projectId) return
    
    // Check for existing dev-server
    const existingDevServers = getProcessesByType('dev-server')
    const existingDevServer = existingDevServers.find(p => p.projectId === projectId)
    
    if (existingDevServer) {
      serverProcessIdRef.current = existingDevServer.processId
      statusRef.current = 'running'
      setStatus('running')
      // Restore the URL from the process store
      if (existingDevServer.url) {
        setUrl(existingDevServer.url)
      }
      return
    }
    
    // Check for existing detection process
    const existingDetections = getProcessesByType('detection')
    const existingDetection = existingDetections.find(p => p.projectId === projectId)
    
    if (existingDetection) {
      detectProcessIdRef.current = existingDetection.processId
      isDetectingRef.current = true
      statusRef.current = 'detecting'
      setStatus('detecting')
    }
  }, [projectId, getProcessesByType])

  // Listen for events relevant to this hook's processes
  // Note: App.tsx handles appending logs to processStore globally,
  // but this hook needs to listen for specific events to update local state
  useEffect(() => {
    let mounted = true
    
    const flushLogs = () => {
      if (!mounted) return
      const buffered = logBufferRef.current
      if (buffered.length > 0) {
        logBufferRef.current = []
        setLogs((prev) => [...prev.slice(-100 + buffered.length), ...buffered])
      }
      logFlushTimeoutRef.current = null
    }
    
    const setupListeners = async () => {
      unlistenOutputRef.current = await listen<AgentOutputEvent>('agent-output', (event) => {
        if (!mounted) return
        
        if (event.payload.processId === serverProcessIdRef.current) {
          // Batch log updates to reduce UI pressure (for local logs state)
          logBufferRef.current.push(event.payload.content)
          if (logFlushTimeoutRef.current === null) {
            logFlushTimeoutRef.current = window.setTimeout(flushLogs, 100)
          }
          
          // Detect URL from output - handles port changes like "Port 5173 is in use, trying another one..."
          // Strip ANSI escape codes first for cleaner matching
          const cleanContent = event.payload.content.replace(/\x1b\[[0-9;]*m/g, '')
          
          // Match URLs with port numbers (e.g., http://localhost:5178/)
          // Use a comprehensive regex that captures the full URL with port
          const urlMatch = cleanContent.match(/https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0):(\d+)/i)
          if (urlMatch) {
            const port = urlMatch[1]
            const detectedUrl = `http://localhost:${port}`
            
            // Update URL if this is a new/different URL
            if (statusRef.current === 'starting') {
              setUrl(detectedUrl)
              statusRef.current = 'running'
              setStatus('running')
              notify.success('Dev server running', detectedUrl)
            } else if (statusRef.current === 'running') {
              // Server is already running but detected a new URL (port changed)
              setUrl((currentUrl) => {
                if (currentUrl !== detectedUrl) {
                  notify.info('Dev server port changed', detectedUrl)
                  return detectedUrl
                }
                return currentUrl
              })
            }
          }
        } else if (event.payload.processId === detectProcessIdRef.current) {
          // Collect detection output for JSON parsing
          detectOutputRef.current += event.payload.content + '\n'
          // Also log to processStore for display in AgentRunView
          appendProcessLog(event.payload.processId, event.payload.streamType as 'stdout' | 'stderr', event.payload.content)
        }
      })
      
      unlistenExitRef.current = await listen<AgentExitEvent>('agent-exit', (event) => {
        if (!mounted) return
        
        if (event.payload.processId === serverProcessIdRef.current) {
          // Note: App.tsx handles unregisterProcess globally
          serverProcessIdRef.current = null
          statusRef.current = 'stopped'
          setStatus('stopped')
          setUrl(null)
        } else if (event.payload.processId === detectProcessIdRef.current) {
          // Parse the detection output
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
                statusRef.current = 'idle'
                setStatus('idle')
                return
              }
            } catch {
              // Fall through to error
            }
          }
          
          setError('Could not detect dev server configuration')
          statusRef.current = 'error'
          setStatus('error')
        }
      })
    }
    
    setupListeners()
    
    return () => {
      mounted = false
      if (logFlushTimeoutRef.current !== null) {
        clearTimeout(logFlushTimeoutRef.current)
      }
      unlistenOutputRef.current?.()
      unlistenExitRef.current?.()
    }
  }, [projectId])

  const detectWithAmp = useCallback(async () => {
    if (!projectPath) return null
    
    // Guard against concurrent detection processes - check both ref and store
    if (detectProcessIdRef.current) {
      return null
    }
    
    // Also check the store for any existing detection processes for this project
    if (projectId) {
      const existingDetections = useProcessStore.getState().getProcessesByType('detection')
      const existingForProject = existingDetections.find(p => p.projectId === projectId)
      if (existingForProject) {
        detectProcessIdRef.current = existingForProject.processId
        return null
      }
    }
    
    detectOutputRef.current = ''
    
    const prompt = usePromptStore.getState().getPrompt('devServerDetection')

    try {
      const result = await invoke<SpawnAgentResult>('spawn_agent', {
        executable: 'amp',
        args: ['--execute', prompt],
        workingDirectory: projectPath,
      })
      
      detectProcessIdRef.current = result.processId
      
      if (projectId) {
        registerProcess({
          processId: result.processId,
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
      
      // Fire and forget - rely on agent-exit event for completion
      invoke('wait_agent', { processId: result.processId }).catch((e) => {
        console.error('wait_agent failed for detection:', e)
      })
      
      return null
    } catch (e) {
      isDetectingRef.current = false
      throw new Error(`Failed to detect dev server: ${e}`)
    }
  }, [projectPath, projectId, registerProcess])

  const detectDevServer = useCallback(async () => {
    // Hard guard using ref - prevents any race conditions
    if (isDetectingRef.current) return
    
    // Skip detection if server is already running
    if (serverProcessIdRef.current) return
    
    // Check the store for any existing dev-server or detection processes for this project
    if (projectId) {
      const state = useProcessStore.getState()
      
      // If dev-server is already running, just update our state to match
      const existingDevServers = state.getProcessesByType('dev-server')
      const existingDevServer = existingDevServers.find(p => p.projectId === projectId)
      if (existingDevServer) {
        serverProcessIdRef.current = existingDevServer.processId
        statusRef.current = 'running'
        setStatus('running')
        // Restore the URL from the process store
        if (existingDevServer.url) {
          setUrl(existingDevServer.url)
        }
        return
      }
      
      // If detection is already running, just track it
      const existingDetections = state.getProcessesByType('detection')
      const existingForProject = existingDetections.find(p => p.projectId === projectId)
      if (existingForProject) {
        detectProcessIdRef.current = existingForProject.processId
        isDetectingRef.current = true
        statusRef.current = 'detecting'
        setStatus('detecting')
        return
      }
    }
    
    isDetectingRef.current = true
    statusRef.current = 'detecting'
    setStatus('detecting')
    setError(null)
    
    try {
      const detected = await detectDevServerFromPackage(projectPath)
      
      if (detected) {
        setConfig(detected)
        statusRef.current = 'idle'
        setStatus('idle')
        isDetectingRef.current = false
        return
      }
      
      // detectWithAmp will complete via agent-exit event
      await detectWithAmp()
    } catch (e) {
      setError(`Failed to detect dev server: ${e}`)
      statusRef.current = 'error'
      setStatus('error')
      isDetectingRef.current = false
    }
  }, [projectPath, projectId, detectWithAmp])

  const startServer = useCallback(async () => {
    if (!config) return
    
    // Hard guards using refs - prevents any race conditions
    if (isStartingRef.current) return
    if (serverProcessIdRef.current) return
    if (statusRef.current === 'running' || statusRef.current === 'starting') return
    
    // Also check if there's already a dev-server for this project in the store
    if (projectId) {
      const existingDevServers = useProcessStore.getState().getProcessesByType('dev-server')
      const existingForProject = existingDevServers.find(p => p.projectId === projectId)
      if (existingForProject) {
        serverProcessIdRef.current = existingForProject.processId
        statusRef.current = 'running'
        setStatus('running')
        // Restore the URL from the process store
        if (existingForProject.url) {
          setUrl(existingForProject.url)
        }
        return
      }
      
      // Clear manually stopped flag since user is explicitly starting
      manuallyStoppedProjects.delete(projectId)
    }
    
    isStartingRef.current = true
    statusRef.current = 'starting'
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
      
      serverProcessIdRef.current = result.processId

      if (projectId) {
        registerProcess({
          processId: result.processId,
          projectId,
          type: 'dev-server',
          label: config.framework ? `Dev Server (${config.framework})` : 'Dev Server',
          command: {
            executable: config.command,
            args: config.args,
            workingDirectory: projectPath,
          },
          url: config.url,
        })
      }
      
      // Fallback transition to running if URL detection doesn't fire
      setTimeout(() => {
        if (serverProcessIdRef.current && statusRef.current === 'starting') {
          statusRef.current = 'running'
          setStatus('running')
        }
      }, 3000)
      
    } catch (e) {
      const errorMessage = `Failed to start dev server: ${e}`
      setError(errorMessage)
      statusRef.current = 'error'
      setStatus('error')
      notify.error('Dev server failed', String(e))
    } finally {
      isStartingRef.current = false
    }
  }, [config, projectPath, projectId, registerProcess])

  const stopServer = useCallback(async (manual = true) => {
    if (!serverProcessIdRef.current) return
    
    statusRef.current = 'stopping'
    setStatus('stopping')
    
    try {
      const processId = serverProcessIdRef.current
      await invoke('kill_agent', { processId: processId })
      if (projectId) {
        unregisterProcess(processId, null, false)
        // Track that this project's dev server was manually stopped
        if (manual) {
          manuallyStoppedProjects.add(projectId)
        }
      }
      serverProcessIdRef.current = null
      statusRef.current = 'stopped'
      setStatus('stopped')
      setUrl(null)
    } catch (e) {
      setError(`Failed to stop dev server: ${e}`)
      statusRef.current = 'error'
      setStatus('error')
    }
  }, [projectId, unregisterProcess])

  const toggleServer = useCallback(async () => {
    if (statusRef.current === 'running' || statusRef.current === 'starting') {
      await stopServer()
    } else if (config) {
      await startServer()
    } else {
      await detectDevServer()
    }
  }, [config, startServer, stopServer, detectDevServer])

  // Note: We intentionally do NOT kill the dev server on unmount.
  // The dev server should persist when the user navigates to view its details
  // or switches between views. It should only be stopped explicitly via stopServer().
  // Detection processes are also left running - they complete on their own.

  // Check if this project was manually stopped
  const wasManualyStopped = projectId ? manuallyStoppedProjects.has(projectId) : false
  
  // Clear the manually stopped flag (called when user explicitly starts)
  const clearStoppedFlag = useCallback(() => {
    if (projectId) {
      manuallyStoppedProjects.delete(projectId)
    }
  }, [projectId])

  return {
    status,
    config,
    url,
    error,
    logs,
    wasManualyStopped,
    detectDevServer,
    startServer,
    stopServer,
    toggleServer,
    clearStoppedFlag,
  }
}
