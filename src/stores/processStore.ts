import { create } from 'zustand'
import { invoke } from '@tauri-apps/api/core'

export type ProcessType = 'build' | 'chat' | 'prd' | 'dev-server' | 'detection'

export interface ProcessLogEntry {
  id: string
  timestamp: Date
  type: 'stdout' | 'stderr' | 'system'
  content: string
}

export interface RunningProcess {
  processId: string
  projectId: string
  type: ProcessType
  label: string
  startedAt: Date
  agentId?: string
}

export interface CompletedProcessInfo {
  processId: string
  projectId: string
  type: ProcessType
  label: string
  agentId?: string
}

interface ProcessStore {
  processes: Record<string, RunningProcess>
  processLogs: Record<string, ProcessLogEntry[]>
  completedProcesses: Record<string, CompletedProcessInfo>
  selectedProcessId: string | null
  
  registerProcess: (process: Omit<RunningProcess, 'startedAt'>) => void
  unregisterProcess: (processId: string) => void
  getProcessesByProject: (projectId: string) => RunningProcess[]
  getProcessesByType: (type: ProcessType) => RunningProcess[]
  getProcess: (processId: string) => RunningProcess | undefined
  getCompletedProcess: (processId: string) => CompletedProcessInfo | undefined
  hasRunningProcesses: (projectId: string) => boolean
  clearProjectProcesses: (projectId: string) => void
  selectProcess: (processId: string | null) => void
  
  // Log management
  appendProcessLog: (processId: string, type: ProcessLogEntry['type'], content: string) => void
  getProcessLogs: (processId: string) => ProcessLogEntry[]
  clearProcessLogs: (processId: string) => void
  saveProcessLogToFile: (processId: string) => Promise<string | null>
}

export const useProcessStore = create<ProcessStore>((set, get) => ({
  processes: {},
  processLogs: {},
  completedProcesses: {},
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
      processLogs: {
        ...state.processLogs,
        [process.processId]: [],
      },
    }))
  },

  unregisterProcess: (processId) => {
    const state = get()
    const process = state.processes[processId]
    
    // Save process info for later reference
    if (process) {
      set((s) => ({
        completedProcesses: {
          ...s.completedProcesses,
          [processId]: {
            processId: process.processId,
            projectId: process.projectId,
            type: process.type,
            label: process.label,
            agentId: process.agentId,
          },
        },
      }))
      
      // Save logs to file
      get().saveProcessLogToFile(processId).catch((e) => {
        console.error('Failed to save process log to file:', e)
      })
    }
    
    set((s) => {
      const { [processId]: _, ...rest } = s.processes
      // Keep logs for completed processes so they can still be viewed
      // Clear selection if the unregistered process was selected
      const newSelectedProcessId = s.selectedProcessId === processId ? null : s.selectedProcessId
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

  getCompletedProcess: (processId) => {
    return get().completedProcesses[processId]
  },

  hasRunningProcesses: (projectId) => {
    return Object.values(get().processes).some((p) => p.projectId === projectId)
  },

  clearProjectProcesses: (projectId) => {
    set((state) => {
      const processesToRemove = Object.entries(state.processes)
        .filter(([_, p]) => p.projectId === projectId)
        .map(([id]) => id)
      
      const filtered = Object.fromEntries(
        Object.entries(state.processes).filter(([_, p]) => p.projectId !== projectId)
      )
      
      // Also clear logs for removed processes
      const filteredLogs = Object.fromEntries(
        Object.entries(state.processLogs).filter(([id]) => !processesToRemove.includes(id))
      )
      
      // Clear completed process info too
      const filteredCompleted = Object.fromEntries(
        Object.entries(state.completedProcesses).filter(([_, p]) => p.projectId !== projectId)
      )
      
      // Clear selection if it belonged to this project
      const selectedProcess = state.selectedProcessId ? state.processes[state.selectedProcessId] : null
      const newSelectedProcessId = selectedProcess?.projectId === projectId ? null : state.selectedProcessId
      return { 
        processes: filtered, 
        processLogs: filteredLogs, 
        completedProcesses: filteredCompleted,
        selectedProcessId: newSelectedProcessId 
      }
    })
  },

  selectProcess: (processId) => {
    set({ selectedProcessId: processId })
  },

  appendProcessLog: (processId, type, content) => {
    const entry: ProcessLogEntry = {
      id: crypto.randomUUID(),
      timestamp: new Date(),
      type,
      content,
    }
    set((state) => ({
      processLogs: {
        ...state.processLogs,
        [processId]: [...(state.processLogs[processId] || []), entry],
      },
    }))
  },

  getProcessLogs: (processId) => {
    return get().processLogs[processId] || []
  },

  clearProcessLogs: (processId) => {
    set((state) => ({
      processLogs: {
        ...state.processLogs,
        [processId]: [],
      },
    }))
  },

  saveProcessLogToFile: async (processId) => {
    const state = get()
    const logs = state.processLogs[processId]
    const process = state.processes[processId] || state.completedProcesses[processId]
    
    if (!logs || logs.length === 0 || !process) {
      return null
    }
    
    try {
      const logEntries = logs.map((entry) => ({
        timestamp: entry.timestamp.toISOString(),
        type: entry.type,
        content: entry.content,
      }))
      
      const logPath = await invoke<string>('save_process_log', {
        processId: process.processId,
        projectId: process.projectId,
        processType: process.type,
        label: process.label,
        logs: logEntries,
      })
      
      return logPath
    } catch (e) {
      console.error('Failed to save process log:', e)
      return null
    }
  },
}))
