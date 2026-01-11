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

export type PrdStatus = 'idle' | 'generating' | 'ready' | 'error'

interface PrdState {
  stories: Story[]
  status: PrdStatus
  selectedStoryId: string | null
  setStories: (stories: Story[]) => void
  updateStory: (id: string, updates: Partial<Story>) => void
  addStory: (story: Omit<Story, 'id'>) => Story
  removeStory: (id: string) => void
  setStatus: (status: PrdStatus) => void
  selectStory: (id: string | null) => void
  savePrd: (projectPath: string) => Promise<void>
}

export const usePrdStore = create<PrdState>((set, get) => ({
  stories: [],
  status: 'idle',
  selectedStoryId: null,

  setStories: (stories) => {
    set({ stories })
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

  setStatus: (status) => {
    set({ status })
  },

  selectStory: (id) => {
    set({ selectedStoryId: id })
  },

  savePrd: async (projectPath: string) => {
    const { stories } = get()
    try {
      await invoke('save_prd', { projectPath, stories })
      console.log('PRD saved successfully')
    } catch (error) {
      console.error('Failed to save PRD:', error)
    }
  },
}))
