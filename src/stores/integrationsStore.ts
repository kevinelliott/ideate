import { create } from 'zustand'
import { invoke } from '@tauri-apps/api/core'
import { useProcessStore } from './processStore'

export interface OutRayConfig {
  enabled: boolean
  useCustomPath: boolean
  cliPath: string | null
  defaultSubdomain: string | null
}

// The bundled OutRay binary is a Tauri sidecar
// Path is resolved at runtime via get_sidecar_path command

export interface TunnelState {
  projectId: string
  processId: string
  localPort: number
  publicUrl: string
  status: 'starting' | 'running' | 'stopping' | 'stopped' | 'error'
  error?: string
}

interface IntegrationsStore {
  outray: OutRayConfig
  tunnels: Record<string, TunnelState>
  isLoading: boolean
  
  loadConfig: () => Promise<void>
  setOutRayConfig: (config: Partial<OutRayConfig>) => Promise<void>
  
  startTunnel: (projectId: string, localPort: number, subdomain?: string) => Promise<string | null>
  stopTunnel: (projectId: string) => Promise<void>
  getTunnel: (projectId: string) => TunnelState | undefined
  updateTunnelStatus: (projectId: string, status: TunnelState['status'], error?: string) => void
  updateTunnelUrl: (projectId: string, publicUrl: string) => void
  removeTunnel: (projectId: string) => void
}

interface Preferences {
  outray?: OutRayConfig
}

export const useIntegrationsStore = create<IntegrationsStore>((set, get) => ({
  outray: {
    enabled: false,
    useCustomPath: false,
    cliPath: null,
    defaultSubdomain: null,
  },
  tunnels: {},
  isLoading: false,

  loadConfig: async () => {
    set({ isLoading: true })
    try {
      const prefs = await invoke<Preferences | null>('load_preferences')
      if (prefs?.outray) {
        set({ outray: prefs.outray })
      }
    } catch (e) {
      console.error('Failed to load integrations config:', e)
    } finally {
      set({ isLoading: false })
    }
  },

  setOutRayConfig: async (config) => {
    const current = get().outray
    const updated = { ...current, ...config }
    set({ outray: updated })
    
    try {
      const prefs = await invoke<Preferences | null>('load_preferences')
      await invoke('save_preferences', {
        preferences: {
          ...prefs,
          outray: updated,
        },
      })
    } catch (e) {
      console.error('Failed to save OutRay config:', e)
    }
  },

  startTunnel: async (projectId, localPort, subdomain) => {
    const { outray } = get()
    const cliPath = outray.cliPath || 'outray'
    const tunnelSubdomain = subdomain || outray.defaultSubdomain
    
    set((state) => ({
      tunnels: {
        ...state.tunnels,
        [projectId]: {
          projectId,
          processId: '',
          localPort,
          publicUrl: '',
          status: 'starting',
        },
      },
    }))

    try {
      const args = [String(localPort)]
      if (tunnelSubdomain) {
        args.push('--subdomain', tunnelSubdomain)
      }

      const result = await invoke<{ processId: string }>('spawn_agent', {
        executable: cliPath,
        args,
        workingDirectory: '.',
      })

      // Register with processStore for Process Viewer visibility and stop control
      useProcessStore.getState().registerProcess({
        processId: result.processId,
        projectId,
        type: 'tunnel',
        label: `Tunnel (port ${localPort})`,
        command: {
          executable: cliPath,
          args,
          workingDirectory: '.',
        },
      })

      set((state) => ({
        tunnels: {
          ...state.tunnels,
          [projectId]: {
            ...state.tunnels[projectId],
            processId: result.processId,
          },
        },
      }))

      return result.processId
    } catch (e) {
      set((state) => ({
        tunnels: {
          ...state.tunnels,
          [projectId]: {
            ...state.tunnels[projectId],
            status: 'error',
            error: String(e),
          },
        },
      }))
      return null
    }
  },

  stopTunnel: async (projectId) => {
    const tunnel = get().tunnels[projectId]
    if (!tunnel?.processId) return

    set((state) => ({
      tunnels: {
        ...state.tunnels,
        [projectId]: {
          ...state.tunnels[projectId],
          status: 'stopping',
        },
      },
    }))

    try {
      await invoke('kill_agent', { processId: tunnel.processId })
      useProcessStore.getState().unregisterProcess(tunnel.processId, null, true)
      set((state) => ({
        tunnels: {
          ...state.tunnels,
          [projectId]: {
            ...state.tunnels[projectId],
            status: 'stopped',
          },
        },
      }))
    } catch (e) {
      console.error('Failed to stop tunnel:', e)
    }
  },

  getTunnel: (projectId) => {
    return get().tunnels[projectId]
  },

  updateTunnelStatus: (projectId, status, error) => {
    set((state) => {
      const tunnel = state.tunnels[projectId]
      if (!tunnel) return state
      return {
        tunnels: {
          ...state.tunnels,
          [projectId]: {
            ...tunnel,
            status,
            error,
          },
        },
      }
    })
  },

  updateTunnelUrl: (projectId, publicUrl) => {
    set((state) => {
      const tunnel = state.tunnels[projectId]
      if (!tunnel) return state
      return {
        tunnels: {
          ...state.tunnels,
          [projectId]: {
            ...tunnel,
            publicUrl,
            status: 'running',
          },
        },
      }
    })
  },

  removeTunnel: (projectId) => {
    set((state) => {
      const { [projectId]: _, ...rest } = state.tunnels
      return { tunnels: rest }
    })
  },
}))
