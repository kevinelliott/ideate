import { create } from 'zustand'
import { invoke } from '@tauri-apps/api/core'

export interface Idea {
  id: string
  title: string
  summary: string
  description: string
  createdAt: string
  updatedAt: string
}

interface IdeasState {
  ideas: Idea[]
  selectedIdeaId: string | null
  isLoaded: boolean
  
  loadIdeas: () => Promise<void>
  addIdea: (idea: Omit<Idea, 'id' | 'createdAt' | 'updatedAt'>) => Promise<Idea>
  updateIdea: (id: string, updates: Partial<Omit<Idea, 'id' | 'createdAt'>>) => Promise<void>
  removeIdea: (id: string) => Promise<void>
  selectIdea: (id: string | null) => void
  getSelectedIdea: () => Idea | null
}

function generateId(): string {
  return `idea-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
}

export const useIdeasStore = create<IdeasState>((set, get) => ({
  ideas: [],
  selectedIdeaId: null,
  isLoaded: false,

  loadIdeas: async () => {
    try {
      const ideas = await invoke<Idea[]>('load_ideas')
      set({ ideas, isLoaded: true })
    } catch (error) {
      console.error('Failed to load ideas:', error)
      set({ ideas: [], isLoaded: true })
    }
  },

  addIdea: async (ideaData) => {
    const now = new Date().toISOString()
    const newIdea: Idea = {
      ...ideaData,
      id: generateId(),
      createdAt: now,
      updatedAt: now,
    }
    
    const ideas = [...get().ideas, newIdea]
    set({ ideas })
    
    try {
      await invoke('save_ideas', { ideas })
    } catch (error) {
      console.error('Failed to save ideas:', error)
    }
    
    return newIdea
  },

  updateIdea: async (id, updates) => {
    const ideas = get().ideas.map((idea) =>
      idea.id === id
        ? { ...idea, ...updates, updatedAt: new Date().toISOString() }
        : idea
    )
    set({ ideas })
    
    try {
      await invoke('save_ideas', { ideas })
    } catch (error) {
      console.error('Failed to save ideas:', error)
    }
  },

  removeIdea: async (id) => {
    const { ideas, selectedIdeaId } = get()
    const newIdeas = ideas.filter((idea) => idea.id !== id)
    set({
      ideas: newIdeas,
      selectedIdeaId: selectedIdeaId === id ? null : selectedIdeaId,
    })
    
    try {
      await invoke('save_ideas', { ideas: newIdeas })
    } catch (error) {
      console.error('Failed to save ideas:', error)
    }
  },

  selectIdea: (id) => {
    set({ selectedIdeaId: id })
  },

  getSelectedIdea: () => {
    const { ideas, selectedIdeaId } = get()
    return ideas.find((idea) => idea.id === selectedIdeaId) ?? null
  },
}))
