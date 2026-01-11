import { create } from 'zustand'

export type BuildStatus = 'idle' | 'running' | 'paused'

export type StoryBuildStatus = 'pending' | 'in-progress' | 'complete' | 'failed'

export interface LogEntry {
  id: string
  timestamp: Date
  type: 'stdout' | 'stderr' | 'system'
  content: string
}

interface BuildState {
  status: BuildStatus
  currentStoryId: string | null
  currentProcessId: string | null
  storyStatuses: Record<string, StoryBuildStatus>
  logs: LogEntry[]
  startBuild: () => void
  pauseBuild: () => void
  resumeBuild: () => void
  cancelBuild: () => void
  setCurrentStoryId: (storyId: string | null) => void
  setCurrentProcessId: (processId: string | null) => void
  setStoryStatus: (storyId: string, status: StoryBuildStatus) => void
  resetStoryStatuses: () => void
  appendLog: (type: LogEntry['type'], content: string) => void
  clearLogs: () => void
}

export const useBuildStore = create<BuildState>((set) => ({
  status: 'idle',
  currentStoryId: null,
  currentProcessId: null,
  storyStatuses: {},
  logs: [],

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

  appendLog: (type, content) => {
    const entry: LogEntry = {
      id: crypto.randomUUID(),
      timestamp: new Date(),
      type,
      content,
    }
    set((state) => ({
      logs: [...state.logs, entry],
    }))
  },

  clearLogs: () => {
    set({ logs: [] })
  },
}))
