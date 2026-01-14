import { useCallback, useEffect, useRef, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { listen, UnlistenFn } from '@tauri-apps/api/event'
import { useIntegrationsStore } from '../stores/integrationsStore'
import { useProcessStore } from '../stores/processStore'
import { notify } from '../utils/notify'

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

export type TunnelStatus = 'idle' | 'starting' | 'running' | 'stopping' | 'stopped' | 'error'

export function useTunnel(projectId: string, localPort: number | null) {
  const [status, setStatus] = useState<TunnelStatus>('idle')
  const [publicUrl, setPublicUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  
  const processIdRef = useRef<string | null>(null)
  const statusRef = useRef<TunnelStatus>('idle')
  const unlistenOutputRef = useRef<UnlistenFn | null>(null)
  const unlistenExitRef = useRef<UnlistenFn | null>(null)
  
  const outrayConfig = useIntegrationsStore((state) => state.outray)
  const registerProcess = useProcessStore((state) => state.registerProcess)
  const updateProcessUrl = useProcessStore((state) => state.updateProcessUrl)
  const unregisterProcess = useProcessStore((state) => state.unregisterProcess)
  
  // Check for existing tunnel on mount
  useEffect(() => {
    const existingTunnels = useProcessStore.getState().getProcessesByType('tunnel')
    const tunnelForProject = existingTunnels.find((p) => p.projectId === projectId)
    if (tunnelForProject) {
      processIdRef.current = tunnelForProject.processId
      statusRef.current = 'running'
      setStatus('running')
      // Restore the tunnel URL from processStore
      if (tunnelForProject.url) {
        setPublicUrl(tunnelForProject.url)
      }
    }
  }, [projectId])
  
  // Set up event listeners for tunnel output
  useEffect(() => {
    let mounted = true
    
    const setupListeners = async () => {
      unlistenOutputRef.current = await listen<AgentOutputEvent>('agent-output', (event) => {
        if (!mounted) return
        const { processId, content } = event.payload
        
        if (processId !== processIdRef.current) return
        
        // Parse OutRay output to extract public URL
        // OutRay typically outputs something like: "Tunnel is live at https://xxx.outray.app"
        console.log('[useTunnel] OutRay output:', content)
        const urlMatch = content.match(/https?:\/\/[^\s]+\.outray\.app[^\s]*/i)
        if (urlMatch && statusRef.current === 'starting') {
          const detectedUrl = urlMatch[0]
          setPublicUrl(detectedUrl)
          statusRef.current = 'running'
          setStatus('running')
          // Store URL in processStore for persistence across remounts
          if (processIdRef.current) {
            updateProcessUrl(processIdRef.current, detectedUrl)
          }
          notify.success('Tunnel active', detectedUrl)
        }
      })
      
      unlistenExitRef.current = await listen<AgentExitEvent>('agent-exit', (event) => {
        if (!mounted) return
        const { processId, exitCode, success } = event.payload
        
        if (processId !== processIdRef.current) return
        
        const wasUserStopped = statusRef.current === 'stopping'
        
        unregisterProcess(processId, exitCode, success)
        processIdRef.current = null
        statusRef.current = 'stopped'
        setStatus('stopped')
        setPublicUrl(null)
        
        if (!success && !wasUserStopped) {
          notify.error('Tunnel closed', `Exit code: ${exitCode}`)
        }
      })
    }
    
    setupListeners()
    
    return () => {
      mounted = false
      unlistenOutputRef.current?.()
      unlistenExitRef.current?.()
    }
  }, [unregisterProcess, updateProcessUrl])
  
  const startTunnel = useCallback(async (subdomain?: string) => {
    if (!localPort) {
      setError('No local port available')
      return
    }
    
    if (processIdRef.current) return
    if (statusRef.current === 'starting' || statusRef.current === 'running') return
    
    const tunnelSubdomain = subdomain || outrayConfig.defaultSubdomain
    
    statusRef.current = 'starting'
    setStatus('starting')
    setError(null)
    setPublicUrl(null)
    
    try {
      // Determine executable based on whether using custom path or bundled sidecar
      let executable: string
      let needsAuthToken = false
      
      if (outrayConfig.useCustomPath && outrayConfig.cliPath) {
        // Use custom path directly
        executable = outrayConfig.cliPath
      } else {
        // Get the best available outray executable
        const execInfo = await invoke<{ path: string; needsAuthToken: boolean }>('get_sidecar_path')
        executable = execInfo.path
        needsAuthToken = execInfo.needsAuthToken
      }
      
      // Build args - if using npx, we need to add 'outray' as the first arg
      const args: string[] = []
      if (executable === 'npx') {
        args.push('outray')
      }
      
      args.push(String(localPort))
      
      // Only pass --key if using bundled binary (which has os.homedir issues)
      if (needsAuthToken) {
        const authToken = await invoke<string | null>('get_auth_token')
        if (authToken) {
          args.push('--key', authToken)
        }
      }
      
      if (tunnelSubdomain) {
        args.push('--subdomain', tunnelSubdomain)
      }
      
      const result = await invoke<SpawnAgentResult>('spawn_agent', {
        executable,
        args,
        workingDirectory: '.',
      })
      
      processIdRef.current = result.processId
      
      registerProcess({
        processId: result.processId,
        projectId,
        type: 'tunnel',
        label: `Tunnel (port ${localPort})`,
        command: {
          executable,
          args,
          workingDirectory: '.',
        },
      })
      
      // Timeout fallback - if we don't get a URL in 30 seconds, consider it failed
      setTimeout(() => {
        if (statusRef.current === 'starting') {
          setError('Tunnel failed to start. Check OutRay authentication.')
          statusRef.current = 'error'
          setStatus('error')
        }
      }, 30000)
      
    } catch (e) {
      const errorMessage = String(e)
      setError(errorMessage)
      statusRef.current = 'error'
      setStatus('error')
      notify.error('Tunnel failed', errorMessage)
    }
  }, [localPort, projectId, outrayConfig, registerProcess])
  
  const stopTunnel = useCallback(async () => {
    if (!processIdRef.current) return
    
    statusRef.current = 'stopping'
    setStatus('stopping')
    
    try {
      await invoke('kill_agent', { processId: processIdRef.current })
      unregisterProcess(processIdRef.current, null, true)
      processIdRef.current = null
      statusRef.current = 'stopped'
      setStatus('stopped')
      setPublicUrl(null)
    } catch (e) {
      setError(`Failed to stop tunnel: ${e}`)
      statusRef.current = 'error'
      setStatus('error')
    }
  }, [unregisterProcess])
  
  const toggleTunnel = useCallback(async () => {
    if (statusRef.current === 'running' || statusRef.current === 'starting') {
      await stopTunnel()
    } else {
      await startTunnel()
    }
  }, [startTunnel, stopTunnel])
  
  const copyUrl = useCallback(async () => {
    if (publicUrl) {
      try {
        await navigator.clipboard.writeText(publicUrl)
        notify.success('Copied', 'Tunnel URL copied to clipboard')
      } catch (e) {
        console.error('Failed to copy URL:', e)
      }
    }
  }, [publicUrl])
  
  return {
    status,
    publicUrl,
    error,
    isEnabled: outrayConfig.enabled,
    startTunnel,
    stopTunnel,
    toggleTunnel,
    copyUrl,
  }
}
