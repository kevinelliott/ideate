import { create } from 'zustand'

export type BuildStatus = 'idle' | 'running' | 'paused'

export type StoryBuildStatus = 'pending' | 'in-progress' | 'complete' | 'failed'

export interface LogEntry {
  id: string
  timestamp: Date
  type: 'stdout' | 'stderr' | 'system'
  content: string
  processId?: string
}

export interface ProcessExitInfo {
  processId: string
  exitCode: number | null
  success: boolean
}

interface BuildState {
  status: BuildStatus
  currentStoryId: string | null
  currentProcessId: string | null
  storyStatuses: Record<string, StoryBuildStatus>
  logs: LogEntry[]
  lastExitInfo: ProcessExitInfo | null
  startBuild: () => void
  pauseBuild: () => void
  resumeBuild: () => void
  cancelBuild: () => void
  setCurrentStoryId: (storyId: string | null) => void
  setCurrentProcessId: (processId: string | null) => void
  setStoryStatus: (storyId: string, status: StoryBuildStatus) => void
  resetStoryStatuses: () => void
  appendLog: (type: LogEntry['type'], content: string, processId?: string) => void
  clearLogs: () => void
  handleProcessExit: (exitInfo: ProcessExitInfo) => void
}

export const useBuildStore = create<BuildState>((set, get) => ({
  status: 'idle',
  currentStoryId: null,
  currentProcessId: null,
  storyStatuses: {},
  logs: [],
  lastExitInfo: null,

  startBuild: () => {
    set({ status: 'running' })
  },

  pauseBuild: () => {
    set({ status: 'paused' })
  },

  resumeBuild: () => {
    set({ status: 'running' })
  },

  cancelBuild: () => {
    set({ status: 'idle', currentStoryId: null, currentProcessId: null })
  },

  setCurrentStoryId: (storyId) => {
    set({ currentStoryId: storyId })
  },

  setCurrentProcessId: (processId) => {
    set({ currentProcessId: processId })
  },

  setStoryStatus: (storyId, status) => {
    set((state) => ({
      storyStatuses: { ...state.storyStatuses, [storyId]: status },
    }))
  },

  resetStoryStatuses: () => {
    set({ storyStatuses: {} })
  },

  appendLog: (type, content, processId) => {
    const entry: LogEntry = {
      id: crypto.randomUUID(),
      timestamp: new Date(),
      type,
      content,
      processId,
    }
    set((state) => ({
      logs: [...state.logs, entry],
    }))
  },

  clearLogs: () => {
    set({ logs: [] })
  },

  handleProcessExit: (exitInfo) => {
    const { currentStoryId, currentProcessId } = get()
    
    set({ lastExitInfo: exitInfo })
    
    if (exitInfo.processId === currentProcessId) {
      const exitMessage = exitInfo.success 
        ? `Process completed successfully (exit code: ${exitInfo.exitCode ?? 0})`
        : `Process failed (exit code: ${exitInfo.exitCode ?? 'unknown'})`
      
      get().appendLog('system', exitMessage, exitInfo.processId)
      
      if (currentStoryId) {
        get().setStoryStatus(currentStoryId, exitInfo.success ? 'complete' : 'failed')
      }
      
      set({ currentProcessId: null })
    }
  },
}))
