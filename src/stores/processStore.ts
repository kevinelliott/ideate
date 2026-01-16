import { create } from 'zustand'
import { invoke } from '@tauri-apps/api/core'
import { emit } from '@tauri-apps/api/event'

export type ProcessType = 'build' | 'chat' | 'prd' | 'dev-server' | 'detection' | 'tunnel'

export interface ProcessLogEntry {
  id: string
  timestamp: Date
  type: 'stdout' | 'stderr' | 'system'
  content: string
}

export interface ProcessCommand {
  executable: string
  args: string[]
  workingDirectory: string
}

export interface RunningProcess {
  processId: string
  projectId: string
  type: ProcessType
  label: string
  startedAt: Date
  agentId?: string
  command?: ProcessCommand
  url?: string
}

export interface CompletedProcessInfo {
  processId: string
  projectId: string
  type: ProcessType
  label: string
  agentId?: string
  command?: ProcessCommand
}

interface ProcessStore {
  processes: Record<string, RunningProcess>
  processLogs: Record<string, ProcessLogEntry[]>
  completedProcesses: Record<string, CompletedProcessInfo>
  selectedProcessId: string | null
  
  registerProcess: (process: Omit<RunningProcess, 'startedAt'>) => void
  updateProcessUrl: (processId: string, url: string) => void
  unregisterProcess: (processId: string, exitCode?: number | null, success?: boolean) => void
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
    const startedAt = new Date()
    
    // Create initial log entries with process info
    const initialLogs: ProcessLogEntry[] = []
    
    // Add process start header
    initialLogs.push({
      id: crypto.randomUUID(),
      timestamp: startedAt,
      type: 'system',
      content: `═══════════════════════════════════════════════════════════════`,
    })
    initialLogs.push({
      id: crypto.randomUUID(),
      timestamp: startedAt,
      type: 'system',
      content: `Process Started: ${process.label}`,
    })
    initialLogs.push({
      id: crypto.randomUUID(),
      timestamp: startedAt,
      type: 'system',
      content: `═══════════════════════════════════════════════════════════════`,
    })
    
    // Add process details
    initialLogs.push({
      id: crypto.randomUUID(),
      timestamp: startedAt,
      type: 'system',
      content: `Process ID: ${process.processId}`,
    })
    initialLogs.push({
      id: crypto.randomUUID(),
      timestamp: startedAt,
      type: 'system',
      content: `Type: ${process.type}`,
    })
    if (process.agentId) {
      initialLogs.push({
        id: crypto.randomUUID(),
        timestamp: startedAt,
        type: 'system',
        content: `Agent: ${process.agentId}`,
      })
    }
    
    // Add command details if provided
    if (process.command) {
      const fullCommand = `${process.command.executable} ${process.command.args.join(' ')}`
      initialLogs.push({
        id: crypto.randomUUID(),
        timestamp: startedAt,
        type: 'system',
        content: `Command: ${fullCommand}`,
      })
      initialLogs.push({
        id: crypto.randomUUID(),
        timestamp: startedAt,
        type: 'system',
        content: `Working Directory: ${process.command.workingDirectory}`,
      })
    }
    
    initialLogs.push({
      id: crypto.randomUUID(),
      timestamp: startedAt,
      type: 'system',
      content: `───────────────────────────────────────────────────────────────`,
    })
    
    const newProcess: RunningProcess = {
      ...process,
      startedAt,
    }
    
    set((state) => ({
      processes: {
        ...state.processes,
        [process.processId]: newProcess,
      },
      processLogs: {
        ...state.processLogs,
        [process.processId]: initialLogs,
      },
    }))
    
    // Emit event for other windows (e.g., Process Viewer)
    emit('process-registered', {
      process: {
        ...newProcess,
        startedAt: startedAt.toISOString(),
      },
    }).catch(() => {})
  },

  updateProcessUrl: (processId, url) => {
    set((state) => {
      const process = state.processes[processId]
      if (!process) return state
      return {
        processes: {
          ...state.processes,
          [processId]: {
            ...process,
            url,
          },
        },
      }
    })
  },

  unregisterProcess: (processId, exitCode?: number | null, success?: boolean) => {
    const state = get()
    const process = state.processes[processId]
    
    // Add completion log entry
    if (process) {
      const now = new Date()
      const duration = now.getTime() - process.startedAt.getTime()
      const durationStr = formatDuration(duration)
      
      get().appendProcessLog(processId, 'system', `───────────────────────────────────────────────────────────────`)
      get().appendProcessLog(processId, 'system', `Process completed after ${durationStr}`)
      
      // Save process info for later reference
      set((s) => ({
        completedProcesses: {
          ...s.completedProcesses,
          [processId]: {
            processId: process.processId,
            projectId: process.projectId,
            type: process.type,
            label: process.label,
            agentId: process.agentId,
            command: process.command,
          },
        },
      }))
      
      // Save logs to file and then save history entry
      get().saveProcessLogToFile(processId).then((logFilePath) => {
        // Save to process history
        const historyEntry = {
          processId: process.processId,
          projectId: process.projectId,
          processType: process.type,
          label: process.label,
          startedAt: process.startedAt.toISOString(),
          completedAt: now.toISOString(),
          durationMs: duration,
          exitCode: exitCode ?? null,
          success: success ?? true,
          agentId: process.agentId,
          command: process.command,
          logFilePath,
        }
        invoke('save_process_history_entry', { entry: historyEntry }).catch((e) => {
          console.error('Failed to save process history entry:', e)
        })
      }).catch((e) => {
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
    
    // Emit event for other windows (e.g., Process Viewer)
    emit('process-unregistered', { processId, exitCode, success }).catch(() => {})
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

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000)
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = seconds % 60
  if (minutes < 60) return `${minutes}m ${remainingSeconds}s`
  const hours = Math.floor(minutes / 60)
  const remainingMinutes = minutes % 60
  return `${hours}h ${remainingMinutes}m`
}
