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

export interface StoryRetryInfo {
  retryCount: number
  previousLogs: LogEntry[][]
}

export interface ConflictInfo {
  storyId: string
  storyTitle: string
  branchName: string
}

export interface SnapshotInfo {
  snapshotRef: string
  snapshotType: 'stash' | 'commit'
}

export interface ProjectBuildState {
  status: BuildStatus
  currentStoryId: string | null
  currentStoryTitle: string | null
  currentProcessId: string | null
  storyStatuses: Record<string, StoryBuildStatus>
  storyRetries: Record<string, StoryRetryInfo>
  storySnapshots: Record<string, SnapshotInfo>
  logs: LogEntry[]
  lastExitInfo: ProcessExitInfo | null
  conflictedBranches: ConflictInfo[]
}

const createEmptyProjectState = (): ProjectBuildState => ({
  status: 'idle',
  currentStoryId: null,
  currentStoryTitle: null,
  currentProcessId: null,
  storyStatuses: {},
  storyRetries: {},
  storySnapshots: {},
  logs: [],
  lastExitInfo: null,
  conflictedBranches: [],
})

interface BuildStore {
  // Per-project state
  projectStates: Record<string, ProjectBuildState>
  
  // Track which projects have an active build loop (prevents duplicate starts)
  activeBuildLoops: Set<string>
  
  // Get state for a specific project
  getProjectState: (projectId: string) => ProjectBuildState
  
  // Per-project actions
  // Atomically try to start a build - returns true if successful, false if already running
  tryStartBuild: (projectId: string) => boolean
  releaseBuildLoop: (projectId: string) => void
  startBuild: (projectId: string) => void
  pauseBuild: (projectId: string) => void
  resumeBuild: (projectId: string) => void
  cancelBuild: (projectId: string) => void
  setCurrentStory: (projectId: string, storyId: string | null, storyTitle?: string | null) => void
  setCurrentProcessId: (projectId: string, processId: string | null) => void
  setStoryStatus: (projectId: string, storyId: string, status: StoryBuildStatus) => void
  resetStoryStatuses: (projectId: string) => void
  appendLog: (projectId: string, type: LogEntry['type'], content: string, processId?: string) => void
  clearLogs: (projectId: string) => void
  handleProcessExit: (projectId: string, exitInfo: ProcessExitInfo) => void
  retryStory: (projectId: string, storyId: string) => void
  getStoryRetryInfo: (projectId: string, storyId: string) => StoryRetryInfo | undefined
  restoreRetryInfo: (projectId: string, storyId: string, retryCount: number) => void
  resetBuildState: (projectId: string) => void
  addConflictedBranch: (projectId: string, conflict: ConflictInfo) => void
  removeConflictedBranch: (projectId: string, branchName: string) => void
  clearConflictedBranches: (projectId: string) => void
  
  // Snapshot management
  setStorySnapshot: (projectId: string, storyId: string, snapshot: SnapshotInfo) => void
  getStorySnapshot: (projectId: string, storyId: string) => SnapshotInfo | undefined
  clearStorySnapshot: (projectId: string, storyId: string) => void
  
  // Get all running projects
  getRunningProjects: () => string[]
}

export const useBuildStore = create<BuildStore>((set, get) => ({
  projectStates: {},
  activeBuildLoops: new Set<string>(),

  getProjectState: (projectId) => {
    return get().projectStates[projectId] || createEmptyProjectState()
  },

  tryStartBuild: (projectId) => {
    const { activeBuildLoops } = get()
    if (activeBuildLoops.has(projectId)) {
      return false
    }
    const newSet = new Set(activeBuildLoops)
    newSet.add(projectId)
    set({ activeBuildLoops: newSet })
    return true
  },

  releaseBuildLoop: (projectId) => {
    const { activeBuildLoops } = get()
    if (activeBuildLoops.has(projectId)) {
      const newSet = new Set(activeBuildLoops)
      newSet.delete(projectId)
      set({ activeBuildLoops: newSet })
    }
  },

  startBuild: (projectId) => {
    set((state) => ({
      projectStates: {
        ...state.projectStates,
        [projectId]: {
          ...(state.projectStates[projectId] || createEmptyProjectState()),
          status: 'running',
        },
      },
    }))
  },

  pauseBuild: (projectId) => {
    set((state) => ({
      projectStates: {
        ...state.projectStates,
        [projectId]: {
          ...(state.projectStates[projectId] || createEmptyProjectState()),
          status: 'paused',
        },
      },
    }))
  },

  resumeBuild: (projectId) => {
    set((state) => ({
      projectStates: {
        ...state.projectStates,
        [projectId]: {
          ...(state.projectStates[projectId] || createEmptyProjectState()),
          status: 'running',
        },
      },
    }))
  },

  cancelBuild: (projectId) => {
    set((state) => ({
      projectStates: {
        ...state.projectStates,
        [projectId]: {
          ...(state.projectStates[projectId] || createEmptyProjectState()),
          status: 'idle',
          currentStoryId: null,
          currentStoryTitle: null,
          currentProcessId: null,
        },
      },
    }))
  },

  setCurrentStory: (projectId, storyId, storyTitle) => {
    set((state) => ({
      projectStates: {
        ...state.projectStates,
        [projectId]: {
          ...(state.projectStates[projectId] || createEmptyProjectState()),
          currentStoryId: storyId,
          currentStoryTitle: storyTitle ?? null,
        },
      },
    }))
  },

  setCurrentProcessId: (projectId, processId) => {
    set((state) => ({
      projectStates: {
        ...state.projectStates,
        [projectId]: {
          ...(state.projectStates[projectId] || createEmptyProjectState()),
          currentProcessId: processId,
        },
      },
    }))
  },

  setStoryStatus: (projectId, storyId, status) => {
    set((state) => {
      const projectState = state.projectStates[projectId] || createEmptyProjectState()
      return {
        projectStates: {
          ...state.projectStates,
          [projectId]: {
            ...projectState,
            storyStatuses: { ...projectState.storyStatuses, [storyId]: status },
          },
        },
      }
    })
  },

  resetStoryStatuses: (projectId) => {
    set((state) => ({
      projectStates: {
        ...state.projectStates,
        [projectId]: {
          ...(state.projectStates[projectId] || createEmptyProjectState()),
          storyStatuses: {},
        },
      },
    }))
  },

  appendLog: (projectId, type, content, processId) => {
    const entry: LogEntry = {
      id: crypto.randomUUID(),
      timestamp: new Date(),
      type,
      content,
      processId,
    }
    set((state) => {
      const projectState = state.projectStates[projectId] || createEmptyProjectState()
      return {
        projectStates: {
          ...state.projectStates,
          [projectId]: {
            ...projectState,
            logs: [...projectState.logs, entry],
          },
        },
      }
    })
  },

  clearLogs: (projectId) => {
    set((state) => ({
      projectStates: {
        ...state.projectStates,
        [projectId]: {
          ...(state.projectStates[projectId] || createEmptyProjectState()),
          logs: [],
        },
      },
    }))
  },

  handleProcessExit: (projectId, exitInfo) => {
    const projectState = get().projectStates[projectId] || createEmptyProjectState()
    const { currentStoryId, currentProcessId, logs } = projectState
    
    if (exitInfo.processId === currentProcessId) {
      const exitMessage = exitInfo.success 
        ? `Process completed successfully (exit code: ${exitInfo.exitCode ?? 0})`
        : `Process failed (exit code: ${exitInfo.exitCode ?? 'unknown'})`
      
      get().appendLog(projectId, 'system', exitMessage, exitInfo.processId)
      
      if (currentStoryId) {
        const newStatus = exitInfo.success ? 'complete' : 'failed'
        get().setStoryStatus(projectId, currentStoryId, newStatus)
        
        if (!exitInfo.success) {
          const storyLogs = [...logs, {
            id: crypto.randomUUID(),
            timestamp: new Date(),
            type: 'system' as const,
            content: exitMessage,
            processId: exitInfo.processId,
          }]
          
          set((state) => {
            const ps = state.projectStates[projectId] || createEmptyProjectState()
            const existingRetryInfo = ps.storyRetries[currentStoryId] || {
              retryCount: 0,
              previousLogs: [],
            }
            return {
              projectStates: {
                ...state.projectStates,
                [projectId]: {
                  ...ps,
                  storyRetries: {
                    ...ps.storyRetries,
                    [currentStoryId]: {
                      retryCount: existingRetryInfo.retryCount,
                      previousLogs: [...existingRetryInfo.previousLogs, storyLogs],
                    },
                  },
                  lastExitInfo: exitInfo,
                  currentProcessId: null,
                },
              },
            }
          })
          return
        }
      }
      
      set((state) => ({
        projectStates: {
          ...state.projectStates,
          [projectId]: {
            ...(state.projectStates[projectId] || createEmptyProjectState()),
            lastExitInfo: exitInfo,
            currentProcessId: null,
          },
        },
      }))
    }
  },

  retryStory: (projectId, storyId) => {
    set((state) => {
      const projectState = state.projectStates[projectId] || createEmptyProjectState()
      const existingRetryInfo = projectState.storyRetries[storyId] || {
        retryCount: 0,
        previousLogs: [],
      }
      return {
        projectStates: {
          ...state.projectStates,
          [projectId]: {
            ...projectState,
            storyStatuses: { ...projectState.storyStatuses, [storyId]: 'pending' },
            storyRetries: {
              ...projectState.storyRetries,
              [storyId]: {
                ...existingRetryInfo,
                retryCount: existingRetryInfo.retryCount + 1,
              },
            },
          },
        },
      }
    })
  },

  getStoryRetryInfo: (projectId, storyId) => {
    const projectState = get().projectStates[projectId]
    return projectState?.storyRetries[storyId]
  },

  restoreRetryInfo: (projectId, storyId, retryCount) => {
    set((state) => {
      const projectState = state.projectStates[projectId] || createEmptyProjectState()
      return {
        projectStates: {
          ...state.projectStates,
          [projectId]: {
            ...projectState,
            storyRetries: {
              ...projectState.storyRetries,
              [storyId]: {
                retryCount,
                previousLogs: projectState.storyRetries[storyId]?.previousLogs || [],
              },
            },
          },
        },
      }
    })
  },

  resetBuildState: (projectId) => {
    set((state) => ({
      projectStates: {
        ...state.projectStates,
        [projectId]: createEmptyProjectState(),
      },
    }))
  },

  addConflictedBranch: (projectId, conflict) => {
    set((state) => {
      const projectState = state.projectStates[projectId] || createEmptyProjectState()
      const existing = projectState.conflictedBranches.find(c => c.branchName === conflict.branchName)
      if (existing) return state
      return {
        projectStates: {
          ...state.projectStates,
          [projectId]: {
            ...projectState,
            conflictedBranches: [...projectState.conflictedBranches, conflict],
          },
        },
      }
    })
  },

  removeConflictedBranch: (projectId, branchName) => {
    set((state) => {
      const projectState = state.projectStates[projectId] || createEmptyProjectState()
      return {
        projectStates: {
          ...state.projectStates,
          [projectId]: {
            ...projectState,
            conflictedBranches: projectState.conflictedBranches.filter(c => c.branchName !== branchName),
          },
        },
      }
    })
  },

  clearConflictedBranches: (projectId) => {
    set((state) => ({
      projectStates: {
        ...state.projectStates,
        [projectId]: {
          ...(state.projectStates[projectId] || createEmptyProjectState()),
          conflictedBranches: [],
        },
      },
    }))
  },

  setStorySnapshot: (projectId, storyId, snapshot) => {
    set((state) => {
      const projectState = state.projectStates[projectId] || createEmptyProjectState()
      return {
        projectStates: {
          ...state.projectStates,
          [projectId]: {
            ...projectState,
            storySnapshots: { ...projectState.storySnapshots, [storyId]: snapshot },
          },
        },
      }
    })
  },

  getStorySnapshot: (projectId, storyId) => {
    const projectState = get().projectStates[projectId]
    return projectState?.storySnapshots[storyId]
  },

  clearStorySnapshot: (projectId, storyId) => {
    set((state) => {
      const projectState = state.projectStates[projectId] || createEmptyProjectState()
      const { [storyId]: _, ...rest } = projectState.storySnapshots
      return {
        projectStates: {
          ...state.projectStates,
          [projectId]: {
            ...projectState,
            storySnapshots: rest,
          },
        },
      }
    })
  },

  getRunningProjects: () => {
    const { projectStates } = get()
    return Object.entries(projectStates)
      .filter(([_, state]) => state.status === 'running')
      .map(([projectId]) => projectId)
  },
}))
