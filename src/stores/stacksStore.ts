import { create } from 'zustand'
import { invoke } from '@tauri-apps/api/core'

export interface StackTool {
  name: string
  category: string
  version?: string
  description?: string
  website?: string
}

export interface Stack {
  id: string
  name: string
  description: string
  category: string
  tools: StackTool[]
  tags: string[]
  isBuiltin: boolean
  isPublished: boolean
  author?: string
  icon?: string
  createdAt: string
  updatedAt: string
}

interface StacksState {
  stacks: Stack[]
  isLoaded: boolean
  
  loadStacks: () => Promise<void>
  addStack: (stack: Omit<Stack, 'id' | 'createdAt' | 'updatedAt' | 'isBuiltin' | 'isPublished'>) => Promise<Stack>
  updateStack: (id: string, updates: Partial<Omit<Stack, 'id' | 'createdAt' | 'isBuiltin'>>) => Promise<void>
  removeStack: (id: string) => Promise<void>
  duplicateStack: (id: string) => Promise<Stack | null>
  getStackById: (id: string) => Stack | undefined
  getStacksByCategory: (category: string) => Stack[]
  getBuiltinStacks: () => Stack[]
  getCustomStacks: () => Stack[]
}

function generateId(): string {
  return `stack-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
}

export const useStacksStore = create<StacksState>((set, get) => ({
  stacks: [],
  isLoaded: false,

  loadStacks: async () => {
    try {
      const stacks = await invoke<Stack[]>('load_stacks')
      set({ stacks, isLoaded: true })
    } catch (error) {
      console.error('Failed to load stacks:', error)
      set({ stacks: [], isLoaded: true })
    }
  },

  addStack: async (stackData) => {
    const now = new Date().toISOString()
    const newStack: Stack = {
      ...stackData,
      id: generateId(),
      isBuiltin: false,
      isPublished: false,
      createdAt: now,
      updatedAt: now,
    }
    
    const stacks = [...get().stacks, newStack]
    set({ stacks })
    
    try {
      await invoke('save_stacks', { stacks })
    } catch (error) {
      console.error('Failed to save stacks:', error)
    }
    
    return newStack
  },

  updateStack: async (id, updates) => {
    const stacks = get().stacks.map((stack) =>
      stack.id === id && !stack.isBuiltin
        ? { ...stack, ...updates, updatedAt: new Date().toISOString() }
        : stack
    )
    set({ stacks })
    
    try {
      await invoke('save_stacks', { stacks })
    } catch (error) {
      console.error('Failed to save stacks:', error)
    }
  },

  removeStack: async (id) => {
    const { stacks } = get()
    const stackToRemove = stacks.find((s) => s.id === id)
    
    // Don't allow removing builtin stacks
    if (stackToRemove?.isBuiltin) {
      console.warn('Cannot remove builtin stack')
      return
    }
    
    const newStacks = stacks.filter((stack) => stack.id !== id)
    set({ stacks: newStacks })
    
    try {
      await invoke('delete_stack', { stackId: id })
    } catch (error) {
      console.error('Failed to delete stack:', error)
    }
  },

  duplicateStack: async (id) => {
    const stack = get().stacks.find((s) => s.id === id)
    if (!stack) return null
    
    const now = new Date().toISOString()
    const newStack: Stack = {
      ...stack,
      id: generateId(),
      name: `${stack.name} (Copy)`,
      isBuiltin: false,
      isPublished: false,
      createdAt: now,
      updatedAt: now,
    }
    
    const stacks = [...get().stacks, newStack]
    set({ stacks })
    
    try {
      await invoke('save_stacks', { stacks })
    } catch (error) {
      console.error('Failed to save stacks:', error)
    }
    
    return newStack
  },

  getStackById: (id) => {
    return get().stacks.find((s) => s.id === id)
  },

  getStacksByCategory: (category) => {
    return get().stacks.filter((s) => s.category === category)
  },

  getBuiltinStacks: () => {
    return get().stacks.filter((s) => s.isBuiltin)
  },

  getCustomStacks: () => {
    return get().stacks.filter((s) => !s.isBuiltin)
  },
}))

// Stack categories for UI
export const STACK_CATEGORIES = [
  'Web Application',
  'Full Stack Web',
  'Desktop/Mobile Application',
  'Mobile Application',
  'Backend API',
  'CLI Tool',
  'Static Site',
  'Library/Package',
  'Other',
] as const

export type StackCategory = typeof STACK_CATEGORIES[number]

// Tool categories for UI
export const TOOL_CATEGORIES = [
  'Frontend Framework',
  'Framework',
  'Build Tool',
  'Language',
  'Styling',
  'Routing',
  'App Framework',
  'Backend Language',
  'Backend Platform',
  'Database',
  'ORM',
  'API',
  'Authentication',
  'Platform',
  'Runtime',
  'CLI Framework',
  'Async Runtime',
  'Serialization',
  'Router',
  'Validation',
  'Package Manager',
  'Deployment',
  'Content',
  'Navigation',
  'Other',
] as const

export type ToolCategory = typeof TOOL_CATEGORIES[number]
