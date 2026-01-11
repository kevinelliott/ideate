import { create } from 'zustand'

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
  setStories: (stories: Story[]) => void
  updateStory: (id: string, updates: Partial<Story>) => void
  addStory: (story: Omit<Story, 'id'>) => Story
  removeStory: (id: string) => void
  setStatus: (status: PrdStatus) => void
}

export const usePrdStore = create<PrdState>((set) => ({
  stories: [],
  status: 'idle',

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
    }))
  },

  setStatus: (status) => {
    set({ status })
  },
}))
