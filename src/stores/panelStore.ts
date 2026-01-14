import { create } from 'zustand'
import { invoke } from '@tauri-apps/api/core'

export interface ProjectPanelState {
  logPanelCollapsed: boolean
  logPanelHeight: number
  previewPanelCollapsed: boolean
  previewPanelWidth: number
  terminalPanelCollapsed: boolean
  terminalPanelHeight: number
}

const DEFAULT_PANEL_STATE: ProjectPanelState = {
  logPanelCollapsed: false,
  logPanelHeight: 200,
  previewPanelCollapsed: true,
  previewPanelWidth: 400,
  terminalPanelCollapsed: true,
  terminalPanelHeight: 300,
}

interface UiState {
  panelStates: Record<string, ProjectPanelState>
  windowState?: WindowState
}

interface WindowState {
  width: number
  height: number
  x?: number
  y?: number
  maximized: boolean
}

interface PanelStore {
  panelStates: Record<string, ProjectPanelState>
  isLoaded: boolean
  
  loadPanelStates: () => Promise<void>
  savePanelStates: () => Promise<void>
  getPanelState: (projectId: string) => ProjectPanelState
  setLogPanelCollapsed: (projectId: string, collapsed: boolean) => void
  setLogPanelHeight: (projectId: string, height: number) => void
  setPreviewPanelCollapsed: (projectId: string, collapsed: boolean) => void
  setPreviewPanelWidth: (projectId: string, width: number) => void
  setTerminalPanelCollapsed: (projectId: string, collapsed: boolean) => void
  setTerminalPanelHeight: (projectId: string, height: number) => void
}

// Debounce timer for saving
let saveTimeout: number | null = null

const debouncedSave = (panelStates: Record<string, ProjectPanelState>) => {
  if (saveTimeout !== null) {
    clearTimeout(saveTimeout)
  }
  saveTimeout = window.setTimeout(() => {
    invoke('save_panel_states', { panelStates }).catch((e) => {
      console.error('Failed to save panel states:', e)
    })
    saveTimeout = null
  }, 500) // 500ms debounce
}

export const usePanelStore = create<PanelStore>((set, get) => ({
  panelStates: {},
  isLoaded: false,

  loadPanelStates: async () => {
    try {
      const uiState = await invoke<UiState>('load_ui_state')
      if (uiState.panelStates) {
        set({ panelStates: uiState.panelStates, isLoaded: true })
      } else {
        set({ isLoaded: true })
      }
    } catch (e) {
      console.error('Failed to load panel states:', e)
      set({ isLoaded: true })
    }
  },

  savePanelStates: async () => {
    const { panelStates } = get()
    try {
      await invoke('save_panel_states', { panelStates })
    } catch (e) {
      console.error('Failed to save panel states:', e)
    }
  },

  getPanelState: (projectId) => {
    return get().panelStates[projectId] || DEFAULT_PANEL_STATE
  },

  setLogPanelCollapsed: (projectId, collapsed) => {
    set((state) => {
      const newStates = {
        ...state.panelStates,
        [projectId]: {
          ...(state.panelStates[projectId] || DEFAULT_PANEL_STATE),
          logPanelCollapsed: collapsed,
        },
      }
      debouncedSave(newStates)
      return { panelStates: newStates }
    })
  },

  setLogPanelHeight: (projectId, height) => {
    set((state) => {
      const newStates = {
        ...state.panelStates,
        [projectId]: {
          ...(state.panelStates[projectId] || DEFAULT_PANEL_STATE),
          logPanelHeight: height,
        },
      }
      debouncedSave(newStates)
      return { panelStates: newStates }
    })
  },

  setPreviewPanelCollapsed: (projectId, collapsed) => {
    set((state) => {
      const newStates = {
        ...state.panelStates,
        [projectId]: {
          ...(state.panelStates[projectId] || DEFAULT_PANEL_STATE),
          previewPanelCollapsed: collapsed,
        },
      }
      debouncedSave(newStates)
      return { panelStates: newStates }
    })
  },

  setPreviewPanelWidth: (projectId, width) => {
    set((state) => {
      const newStates = {
        ...state.panelStates,
        [projectId]: {
          ...(state.panelStates[projectId] || DEFAULT_PANEL_STATE),
          previewPanelWidth: width,
        },
      }
      debouncedSave(newStates)
      return { panelStates: newStates }
    })
  },

  setTerminalPanelCollapsed: (projectId, collapsed) => {
    set((state) => {
      const newStates = {
        ...state.panelStates,
        [projectId]: {
          ...(state.panelStates[projectId] || DEFAULT_PANEL_STATE),
          terminalPanelCollapsed: collapsed,
        },
      }
      debouncedSave(newStates)
      return { panelStates: newStates }
    })
  },

  setTerminalPanelHeight: (projectId, height) => {
    set((state) => {
      const newStates = {
        ...state.panelStates,
        [projectId]: {
          ...(state.panelStates[projectId] || DEFAULT_PANEL_STATE),
          terminalPanelHeight: height,
        },
      }
      debouncedSave(newStates)
      return { panelStates: newStates }
    })
  },
}))
