import { create } from 'zustand'

export type ProcessType = 'build' | 'chat' | 'prd' | 'dev-server' | 'detection'

export interface RunningProcess {
  processId: string
  projectId: string
  type: ProcessType
  label: string
  startedAt: Date
  agentId?: string
}

interface ProcessStore {
  processes: Record<string, RunningProcess>
  selectedProcessId: string | null
  
  registerProcess: (process: Omit<RunningProcess, 'startedAt'>) => void
  unregisterProcess: (processId: string) => void
  getProcessesByProject: (projectId: string) => RunningProcess[]
  getProcessesByType: (type: ProcessType) => RunningProcess[]
  getProcess: (processId: string) => RunningProcess | undefined
  hasRunningProcesses: (projectId: string) => boolean
  clearProjectProcesses: (projectId: string) => void
  selectProcess: (processId: string | null) => void
}

export const useProcessStore = create<ProcessStore>((set, get) => ({
  processes: {},
  selectedProcessId: null,

  registerProcess: (process) => {
    set((state) => ({
      processes: {
        ...state.processes,
        [process.processId]: {
          ...process,
          startedAt: new Date(),
        },
      },
    }))
  },

  unregisterProcess: (processId) => {
    set((state) => {
      const { [processId]: _, ...rest } = state.processes
      // Clear selection if the unregistered process was selected
      const newSelectedProcessId = state.selectedProcessId === processId ? null : state.selectedProcessId
      return { processes: rest, selectedProcessId: newSelectedProcessId }
    })
  },

  getProcessesByProject: (projectId) => {
    return Object.values(get().processes).filter((p) => p.projectId === projectId)
  },

  getProcessesByType: (type) => {
    return Object.values(get().processes).filter((p) => p.type === type)
  },

  getProcess: (processId) => {
    return get().processes[processId]
  },

  hasRunningProcesses: (projectId) => {
    return Object.values(get().processes).some((p) => p.projectId === projectId)
  },

  clearProjectProcesses: (projectId) => {
    set((state) => {
      const filtered = Object.fromEntries(
        Object.entries(state.processes).filter(([_, p]) => p.projectId !== projectId)
      )
      // Clear selection if it belonged to this project
      const selectedProcess = state.selectedProcessId ? state.processes[state.selectedProcessId] : null
      const newSelectedProcessId = selectedProcess?.projectId === projectId ? null : state.selectedProcessId
      return { processes: filtered, selectedProcessId: newSelectedProcessId }
    })
  },

  selectProcess: (processId) => {
    set({ selectedProcessId: processId })
  },
}))
