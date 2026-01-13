import { create } from 'zustand'

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

interface PanelStore {
  panelStates: Record<string, ProjectPanelState>
  
  getPanelState: (projectId: string) => ProjectPanelState
  setLogPanelCollapsed: (projectId: string, collapsed: boolean) => void
  setLogPanelHeight: (projectId: string, height: number) => void
  setPreviewPanelCollapsed: (projectId: string, collapsed: boolean) => void
  setPreviewPanelWidth: (projectId: string, width: number) => void
  setTerminalPanelCollapsed: (projectId: string, collapsed: boolean) => void
  setTerminalPanelHeight: (projectId: string, height: number) => void
}

export const usePanelStore = create<PanelStore>((set, get) => ({
  panelStates: {},

  getPanelState: (projectId) => {
    return get().panelStates[projectId] || DEFAULT_PANEL_STATE
  },

  setLogPanelCollapsed: (projectId, collapsed) => {
    set((state) => ({
      panelStates: {
        ...state.panelStates,
        [projectId]: {
          ...state.panelStates[projectId] || DEFAULT_PANEL_STATE,
          logPanelCollapsed: collapsed,
        },
      },
    }))
  },

  setLogPanelHeight: (projectId, height) => {
    set((state) => ({
      panelStates: {
        ...state.panelStates,
        [projectId]: {
          ...state.panelStates[projectId] || DEFAULT_PANEL_STATE,
          logPanelHeight: height,
        },
      },
    }))
  },

  setPreviewPanelCollapsed: (projectId, collapsed) => {
    set((state) => ({
      panelStates: {
        ...state.panelStates,
        [projectId]: {
          ...state.panelStates[projectId] || DEFAULT_PANEL_STATE,
          previewPanelCollapsed: collapsed,
        },
      },
    }))
  },

  setPreviewPanelWidth: (projectId, width) => {
    set((state) => ({
      panelStates: {
        ...state.panelStates,
        [projectId]: {
          ...state.panelStates[projectId] || DEFAULT_PANEL_STATE,
          previewPanelWidth: width,
        },
      },
    }))
  },

  setTerminalPanelCollapsed: (projectId, collapsed) => {
    set((state) => ({
      panelStates: {
        ...state.panelStates,
        [projectId]: {
          ...state.panelStates[projectId] || DEFAULT_PANEL_STATE,
          terminalPanelCollapsed: collapsed,
        },
      },
    }))
  },

  setTerminalPanelHeight: (projectId, height) => {
    set((state) => ({
      panelStates: {
        ...state.panelStates,
        [projectId]: {
          ...state.panelStates[projectId] || DEFAULT_PANEL_STATE,
          terminalPanelHeight: height,
        },
      },
    }))
  },
}))
