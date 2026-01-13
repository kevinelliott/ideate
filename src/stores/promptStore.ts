import { create } from 'zustand'
import { invoke } from '@tauri-apps/api/core'
import { DEFAULT_PROMPTS, applyVariables, type PromptOverrides } from '../utils/prompts'

interface Preferences {
  defaultAgent: string | null
  defaultAutonomy: string
  logBufferSize: number
  agentPaths: Array<{ agentId: string; path: string }>
  theme: string
  promptOverrides: Record<string, string>
}

interface PromptStore {
  overrides: PromptOverrides
  isLoaded: boolean
  
  loadOverrides: () => Promise<void>
  setOverrides: (overrides: PromptOverrides) => void
  
  getPrompt: (promptId: keyof typeof DEFAULT_PROMPTS, variables?: Record<string, string>) => string
}

export const usePromptStore = create<PromptStore>((set, get) => ({
  overrides: {},
  isLoaded: false,

  loadOverrides: async () => {
    try {
      const prefs = await invoke<Preferences | null>('load_preferences')
      if (prefs?.promptOverrides) {
        set({ overrides: prefs.promptOverrides, isLoaded: true })
      } else {
        set({ isLoaded: true })
      }
    } catch (error) {
      console.error('Failed to load prompt overrides:', error)
      set({ isLoaded: true })
    }
  },

  setOverrides: (overrides) => {
    set({ overrides })
  },

  getPrompt: (promptId, variables) => {
    const { overrides } = get()
    const template = DEFAULT_PROMPTS[promptId]
    
    if (!template) {
      throw new Error(`Unknown prompt: ${promptId}`)
    }
    
    const promptText = overrides[promptId] || template.defaultPrompt
    
    if (variables) {
      return applyVariables(promptText, variables)
    }
    
    return promptText
  },
}))
