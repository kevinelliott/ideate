import { create } from 'zustand'
import { invoke } from '@tauri-apps/api/core'
import { listen, emit } from '@tauri-apps/api/event'

// Debug: log when prdStore module is loaded
console.log('[prdStore] Module loaded in window:', window.location.pathname)

export interface Story {
  id: string
  title: string
  description: string
  acceptanceCriteria: string[]
  priority: number
  passes: boolean
  notes: string
}

export interface PrdMetadata {
  project?: string
  description?: string
  branchName?: string
}

export type PrdStatus = 'idle' | 'generating' | 'ready' | 'error'

/** Per-project PRD state */
interface ProjectPrdState {
  stories: Story[]
  metadata: PrdMetadata
  status: PrdStatus
  selectedStoryId: string | null
}

function createDefaultProjectPrd(): ProjectPrdState {
  return {
    stories: [],
    metadata: {},
    status: 'idle',
    selectedStoryId: null,
  }
}

interface PrdState {
  /** Per-project PRD data keyed by projectId */
  projectPrds: Record<string, ProjectPrdState>
  
  /** Get PRD state for a project (creates default if not exists) */
  getProjectPrd: (projectId: string) => ProjectPrdState
  
  /** Set stories for a specific project */
  setStories: (projectId: string, stories: Story[]) => void
  
  /** Set metadata for a specific project */
  setMetadata: (projectId: string, metadata: PrdMetadata) => void
  
  /** Set full PRD for a specific project */
  setPrd: (projectId: string, stories: Story[], metadata: PrdMetadata) => void
  
  /** Clear PRD for a specific project */
  clearPrd: (projectId: string) => void
  
  /** Update a story in a specific project */
  updateStory: (projectId: string, storyId: string, updates: Partial<Story>) => void
  
  /** Add a story to a specific project */
  addStory: (projectId: string, storyData: Omit<Story, 'id'>) => Story
  
  /** Remove a story from a specific project */
  removeStory: (projectId: string, storyId: string) => void
  
  /** Reorder stories in a specific project */
  reorderStories: (projectId: string, fromIndex: number, toIndex: number) => void
  
  /** Set status for a specific project */
  setStatus: (projectId: string, status: PrdStatus) => void
  
  /** Select a story in a specific project */
  selectStory: (projectId: string, storyId: string | null) => void
  
  /** Save PRD for a specific project to disk */
  savePrd: (projectId: string, projectPath: string) => Promise<void>
}

export const usePrdStore = create<PrdState>((set, get) => ({
  projectPrds: {},

  getProjectPrd: (projectId: string) => {
    const state = get()
    return state.projectPrds[projectId] ?? createDefaultProjectPrd()
  },

  setStories: (projectId: string, stories: Story[]) => {
    set((state) => ({
      projectPrds: {
        ...state.projectPrds,
        [projectId]: {
          ...(state.projectPrds[projectId] ?? createDefaultProjectPrd()),
          stories,
        },
      },
    }))
  },

  setMetadata: (projectId: string, metadata: PrdMetadata) => {
    set((state) => ({
      projectPrds: {
        ...state.projectPrds,
        [projectId]: {
          ...(state.projectPrds[projectId] ?? createDefaultProjectPrd()),
          metadata,
        },
      },
    }))
  },

  setPrd: (projectId: string, stories: Story[], metadata: PrdMetadata) => {
    set((state) => ({
      projectPrds: {
        ...state.projectPrds,
        [projectId]: {
          ...(state.projectPrds[projectId] ?? createDefaultProjectPrd()),
          stories,
          metadata,
          status: 'ready',
        },
      },
    }))
  },

  clearPrd: (projectId: string) => {
    set((state) => ({
      projectPrds: {
        ...state.projectPrds,
        [projectId]: createDefaultProjectPrd(),
      },
    }))
  },

  updateStory: (projectId: string, storyId: string, updates: Partial<Story>) => {
    set((state) => {
      const projectPrd = state.projectPrds[projectId] ?? createDefaultProjectPrd()
      return {
        projectPrds: {
          ...state.projectPrds,
          [projectId]: {
            ...projectPrd,
            stories: projectPrd.stories.map((s) =>
              s.id === storyId ? { ...s, ...updates } : s
            ),
          },
        },
      }
    })
  },

  addStory: (projectId: string, storyData: Omit<Story, 'id'>) => {
    const newStory: Story = {
      ...storyData,
      id: `US-${String(storyData.priority).padStart(3, '0')}`,
    }
    set((state) => {
      const projectPrd = state.projectPrds[projectId] ?? createDefaultProjectPrd()
      return {
        projectPrds: {
          ...state.projectPrds,
          [projectId]: {
            ...projectPrd,
            stories: [...projectPrd.stories, newStory],
          },
        },
      }
    })
    return newStory
  },

  removeStory: (projectId: string, storyId: string) => {
    set((state) => {
      const projectPrd = state.projectPrds[projectId] ?? createDefaultProjectPrd()
      return {
        projectPrds: {
          ...state.projectPrds,
          [projectId]: {
            ...projectPrd,
            stories: projectPrd.stories.filter((s) => s.id !== storyId),
            selectedStoryId: projectPrd.selectedStoryId === storyId ? null : projectPrd.selectedStoryId,
          },
        },
      }
    })
  },

  reorderStories: (projectId: string, fromIndex: number, toIndex: number) => {
    set((state) => {
      const projectPrd = state.projectPrds[projectId] ?? createDefaultProjectPrd()
      const stories = [...projectPrd.stories]
      const [removed] = stories.splice(fromIndex, 1)
      stories.splice(toIndex, 0, removed)
      const reorderedStories = stories.map((story, index) => ({
        ...story,
        priority: index + 1,
      }))
      return {
        projectPrds: {
          ...state.projectPrds,
          [projectId]: {
            ...projectPrd,
            stories: reorderedStories,
          },
        },
      }
    })
  },

  setStatus: (projectId: string, status: PrdStatus) => {
    set((state) => ({
      projectPrds: {
        ...state.projectPrds,
        [projectId]: {
          ...(state.projectPrds[projectId] ?? createDefaultProjectPrd()),
          status,
        },
      },
    }))
  },

  selectStory: (projectId: string, storyId: string | null) => {
    set((state) => ({
      projectPrds: {
        ...state.projectPrds,
        [projectId]: {
          ...(state.projectPrds[projectId] ?? createDefaultProjectPrd()),
          selectedStoryId: storyId,
        },
      },
    }))
  },

  savePrd: async (projectId: string, projectPath: string) => {
    const { projectPrds } = get()
    const projectPrd = projectPrds[projectId]
    
    if (!projectPrd) {
      console.error(`[prdStore] No PRD loaded for project ${projectId}`)
      return
    }
    
    try {
      const prd = {
        project: projectPrd.metadata.project,
        description: projectPrd.metadata.description,
        branchName: projectPrd.metadata.branchName,
        userStories: projectPrd.stories,
      }
      await invoke('save_prd', { projectPath, prd })
    } catch (error) {
      console.error('Failed to save PRD:', error)
    }
  },
}))

// Listen for story list sync requests from Story Manager window
// Only handle in main window (path is "/" or empty, not /story-manager or /process-viewer)
listen<{ projectId?: string }>('request-story-list', async (event) => {
  const currentPath = window.location.pathname;
  const isMainWindow = currentPath === '/' || currentPath === '' || currentPath === '/index.html';
  console.log('[prdStore] request-story-list received:', event.payload, 'window:', currentPath, 'isMainWindow:', isMainWindow)
  
  // Only the main window should respond to this request
  if (!isMainWindow) {
    console.log('[prdStore] Ignoring request in non-main window:', currentPath)
    return
  }
  
  const { useProjectStore } = await import('./projectStore')
  const { useBuildStore } = await import('./buildStore')
  const { invoke } = await import('@tauri-apps/api/core')
  
  // Use requested projectId or fall back to active project
  const requestedProjectId = event.payload?.projectId
  const activeProjectId = useProjectStore.getState().activeProjectId
  const targetProjectId = requestedProjectId ?? activeProjectId
  
  console.log('[prdStore] targetProjectId:', targetProjectId, 'requestedProjectId:', requestedProjectId, 'activeProjectId:', activeProjectId)
  
  if (!targetProjectId) {
    console.log('[prdStore] No targetProjectId, emitting empty story-list-sync')
    await emit('story-list-sync', {
      stories: [],
      projectId: '',
      projectName: '',
    })
    return
  }
  
  const projects = useProjectStore.getState().projects
  const project = projects.find(p => p.id === targetProjectId)
  let projectPrd = usePrdStore.getState().projectPrds[targetProjectId]
  
  console.log('[prdStore] projects count:', projects.length, 'found project:', project?.name, 'projectPrd exists:', !!projectPrd)
  
  // If PRD not loaded in memory, load from disk
  if (!projectPrd && project?.path) {
    try {
      interface Prd {
        project?: string
        description?: string
        branchName?: string
        userStories?: Array<{
          id: string
          title: string
          description: string
          acceptanceCriteria: string[]
          priority: number
          passes: boolean
          notes: string
        }>
      }
      const prd = await invoke<Prd | null>('load_prd', { projectPath: project.path })
      if (prd?.userStories) {
        const stories = prd.userStories.map((s, index) => ({
          id: s.id || `US-${String(index + 1).padStart(3, '0')}`,
          title: s.title || '',
          description: s.description || '',
          acceptanceCriteria: s.acceptanceCriteria || [],
          priority: s.priority ?? index + 1,
          passes: s.passes ?? false,
          notes: s.notes || '',
        }))
        usePrdStore.getState().setPrd(targetProjectId, stories, {
          project: prd.project,
          description: prd.description,
          branchName: prd.branchName,
        })
        projectPrd = usePrdStore.getState().projectPrds[targetProjectId]
      }
    } catch (error) {
      console.error('[prdStore] Failed to load PRD for story list:', error)
    }
  }
  
  const storyStatuses = useBuildStore.getState().getProjectState(targetProjectId).storyStatuses
  const stories = projectPrd?.stories ?? []
  
  console.log('[prdStore] stories count:', stories.length, 'emitting story-list-sync')
  
  const storiesWithStatus = stories.map(s => ({
    id: s.id,
    title: s.title,
    status: storyStatuses[s.id] || (s.passes ? 'complete' : 'pending'),
    passes: s.passes,
  }))

  await emit('story-list-sync', {
    stories: storiesWithStatus,
    projectId: targetProjectId,
    projectName: project?.name || '',
  })
  
  console.log('[prdStore] story-list-sync emitted with', storiesWithStatus.length, 'stories for project:', project?.name)
}).catch((err) => {
  console.error('[prdStore] Failed to set up request-story-list listener:', err)
})

// Listen for bulk status changes from Story Manager
// Only handle in main window
listen<{
  projectId: string
  storyIds: string[]
  status: string
  passes: boolean
}>('bulk-story-status-change', async (event) => {
  // Only the main window should handle this
  const currentPath = window.location.pathname;
  const isMainWindow = currentPath === '/' || currentPath === '' || currentPath === '/index.html';
  if (!isMainWindow) {
    return
  }
  
  const { projectId, storyIds, status, passes } = event.payload
  const { useProjectStore } = await import('./projectStore')
  const { useBuildStore } = await import('./buildStore')
  
  // Update each story in the correct project's PRD
  for (const storyId of storyIds) {
    usePrdStore.getState().updateStory(projectId, storyId, { passes })
    useBuildStore.getState().setStoryStatus(projectId, storyId, status as 'pending' | 'complete' | 'failed' | 'in-progress')
  }
  
  // Save the PRD
  const project = useProjectStore.getState().projects.find(p => p.id === projectId)
  if (project?.path) {
    await usePrdStore.getState().savePrd(projectId, project.path)
  }
}).catch((err) => {
  console.error('[prdStore] Failed to set up bulk-story-status-change listener:', err)
})

// Listen for bulk delete from Story Manager
// Only handle in main window
listen<{
  projectId: string
  storyIds: string[]
}>('bulk-story-delete', async (event) => {
  // Only the main window should handle this
  const currentPath = window.location.pathname;
  const isMainWindow = currentPath === '/' || currentPath === '' || currentPath === '/index.html';
  if (!isMainWindow) {
    return
  }
  
  const { projectId, storyIds } = event.payload
  const { useProjectStore } = await import('./projectStore')
  
  // Delete each story from the correct project's PRD
  for (const storyId of storyIds) {
    usePrdStore.getState().removeStory(projectId, storyId)
  }
  
  // Save the PRD
  const project = useProjectStore.getState().projects.find(p => p.id === projectId)
  if (project?.path) {
    await usePrdStore.getState().savePrd(projectId, project.path)
  }
}).catch((err) => {
  console.error('[prdStore] Failed to set up bulk-story-delete listener:', err)
})
