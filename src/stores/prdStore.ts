import { create } from 'zustand'
import { invoke } from '@tauri-apps/api/core'

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
  savePrd: (projectPath: string) => Promise<void>
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

  savePrd: async (projectPath: string) => {
    const { stories, metadata } = get()
    try {
      const prd = {
        project: metadata.project,
        description: metadata.description,
        branchName: metadata.branchName,
        userStories: stories,
      }
      await invoke('save_prd', { projectPath, prd })
      console.log('PRD saved successfully')
    } catch (error) {
      console.error('Failed to save PRD:', error)
    }
  },

  getLoadedProjectId: () => get().loadedProjectId,
}))
