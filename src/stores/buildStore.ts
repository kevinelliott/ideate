import { create } from 'zustand'

export type BuildStatus = 'idle' | 'running' | 'paused'

export interface LogEntry {
  id: string
  timestamp: Date
  type: 'stdout' | 'stderr' | 'system'
  content: string
}

interface BuildState {
  status: BuildStatus
  currentStoryId: string | null
  logs: LogEntry[]
  startBuild: () => void
  pauseBuild: () => void
  resumeBuild: () => void
  cancelBuild: () => void
  setCurrentStoryId: (storyId: string | null) => void
  appendLog: (type: LogEntry['type'], content: string) => void
  clearLogs: () => void
}

export const useBuildStore = create<BuildState>((set) => ({
  status: 'idle',
  currentStoryId: null,
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
    set({ status: 'idle', currentStoryId: null })
  },

  setCurrentStoryId: (storyId) => {
    set({ currentStoryId: storyId })
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
