import { create } from 'zustand'
import { invoke } from '@tauri-apps/api/core'
import { listen, emit } from '@tauri-apps/api/event'

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

interface PrdState {
  stories: Story[]
  metadata: PrdMetadata
  status: PrdStatus
  selectedStoryId: string | null
  loadedProjectId: string | null
  setStories: (stories: Story[]) => void
  setMetadata: (metadata: PrdMetadata) => void
  setPrd: (stories: Story[], metadata: PrdMetadata, projectId?: string) => void
  clearPrd: () => void
  updateStory: (id: string, updates: Partial<Story>) => void
  addStory: (story: Omit<Story, 'id'>) => Story
  removeStory: (id: string) => void
  reorderStories: (fromIndex: number, toIndex: number) => void
  setStatus: (status: PrdStatus) => void
  selectStory: (id: string | null) => void
  savePrd: (projectId: string, projectPath: string) => Promise<void>
  getLoadedProjectId: () => string | null
}

export const usePrdStore = create<PrdState>((set, get) => ({
  stories: [],
  metadata: {},
  status: 'idle',
  selectedStoryId: null,
  loadedProjectId: null,

  setStories: (stories) => {
    set({ stories })
  },

  setMetadata: (metadata) => {
    set({ metadata })
  },

  setPrd: (stories, metadata, projectId) => {
    set({ stories, metadata, loadedProjectId: projectId ?? null })
  },

  clearPrd: () => {
    set({
      stories: [],
      metadata: {},
      status: 'idle',
      selectedStoryId: null,
      loadedProjectId: null,
    })
  },

  updateStory: (id, updates) => {
    set((state) => ({
      stories: state.stories.map((s) =>
        s.id === id ? { ...s, ...updates } : s
      ),
    }))
  },

  addStory: (storyData) => {
    const newStory: Story = {
      ...storyData,
      id: `US-${String(storyData.priority).padStart(3, '0')}`,
    }
    set((state) => ({
      stories: [...state.stories, newStory],
    }))
    return newStory
  },

  removeStory: (id) => {
    set((state) => ({
      stories: state.stories.filter((s) => s.id !== id),
      selectedStoryId: state.selectedStoryId === id ? null : state.selectedStoryId,
    }))
  },

  reorderStories: (fromIndex, toIndex) => {
    set((state) => {
      const stories = [...state.stories]
      const [removed] = stories.splice(fromIndex, 1)
      stories.splice(toIndex, 0, removed)
      const reorderedStories = stories.map((story, index) => ({
        ...story,
        priority: index + 1,
      }))
      return { stories: reorderedStories }
    })
  },

  setStatus: (status) => {
    set({ status })
  },

  selectStory: (id) => {
    set({ selectedStoryId: id })
  },

  savePrd: async (projectId: string, projectPath: string) => {
    const { stories, metadata, loadedProjectId } = get()
    
    // Guard: refuse to save if the in-memory PRD belongs to a different project
    if (loadedProjectId && loadedProjectId !== projectId) {
      console.error(
        `[prdStore] Refusing to save PRD: loadedProjectId=${loadedProjectId} does not match requested projectId=${projectId}`
      )
      return
    }
    
    try {
      const prd = {
        project: metadata.project,
        description: metadata.description,
        branchName: metadata.branchName,
        userStories: stories,
      }
      await invoke('save_prd', { projectPath, prd })
    } catch (error) {
      console.error('Failed to save PRD:', error)
    }
  },

  getLoadedProjectId: () => get().loadedProjectId,
}))

// Listen for story list sync requests from Story Manager window
// This runs at module load time so it's always available
listen('request-story-list', async () => {
  // Import dynamically to avoid circular dependencies
  const { useProjectStore } = await import('./projectStore')
  const { useBuildStore } = await import('./buildStore')
  
  const currentActiveProjectId = useProjectStore.getState().activeProjectId
  const currentProject = useProjectStore.getState().projects.find(p => p.id === currentActiveProjectId)
  const currentStories = usePrdStore.getState().stories
  const currentStoryStatuses = currentActiveProjectId 
    ? useBuildStore.getState().getProjectState(currentActiveProjectId).storyStatuses 
    : {}
  
  // Map stories to include status
  const storiesWithStatus = currentStories.map(s => ({
    id: s.id,
    title: s.title,
    status: currentStoryStatuses[s.id] || (s.passes ? 'complete' : 'pending'),
    passes: s.passes,
  }))

  await emit('story-list-sync', {
    stories: storiesWithStatus,
    projectId: currentActiveProjectId || '',
    projectName: currentProject?.name || '',
  })
}).catch((err) => {
  console.error('[prdStore] Failed to set up request-story-list listener:', err)
})

// Listen for bulk status changes from Story Manager
listen<{
  projectId: string
  storyIds: string[]
  status: string
  passes: boolean
}>('bulk-story-status-change', async (event) => {
  const { useProjectStore } = await import('./projectStore')
  const { useBuildStore } = await import('./buildStore')
  
  const { projectId, storyIds, status, passes } = event.payload
  
  // Update each story
  for (const storyId of storyIds) {
    usePrdStore.getState().updateStory(storyId, { passes })
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
listen<{
  projectId: string
  storyIds: string[]
}>('bulk-story-delete', async (event) => {
  const { useProjectStore } = await import('./projectStore')
  
  const { projectId, storyIds } = event.payload
  
  // Delete each story
  for (const storyId of storyIds) {
    usePrdStore.getState().removeStory(storyId)
  }
  
  // Save the PRD
  const project = useProjectStore.getState().projects.find(p => p.id === projectId)
  if (project?.path) {
    await usePrdStore.getState().savePrd(projectId, project.path)
  }
}).catch((err) => {
  console.error('[prdStore] Failed to set up bulk-story-delete listener:', err)
})
