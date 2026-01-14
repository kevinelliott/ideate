import { create } from 'zustand'
import { invoke } from '@tauri-apps/api/core'

export type ProjectStatus = 'idle' | 'generating' | 'ready' | 'error'

export interface Project {
  id: string
  name: string
  description: string
  path: string
  status: ProjectStatus
  createdAt: string
}

interface ProjectState {
  projects: Project[]
  activeProjectId: string | null
  processHistoryProjectId: string | null
  isLoaded: boolean
  addProject: (project: Omit<Project, 'id' | 'createdAt'>) => Project
  removeProject: (id: string) => void
  setActiveProject: (id: string | null) => void
  updateProject: (id: string, updates: Partial<Project>) => void
  loadProjects: () => Promise<void>
  saveProjects: () => Promise<void>
  setProjects: (projects: Project[]) => void
  showProcessHistory: (projectId: string) => void
  hideProcessHistory: () => void
}

export const useProjectStore = create<ProjectState>((set, get) => ({
  projects: [],
  activeProjectId: null,
  processHistoryProjectId: null,
  isLoaded: false,

  addProject: (projectData) => {
    const newProject: Project = {
      ...projectData,
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
    }
    set((state) => ({
      projects: [...state.projects, newProject],
    }))
    get().saveProjects()
    return newProject
  },

  removeProject: (id) => {
    set((state) => ({
      projects: state.projects.filter((p) => p.id !== id),
      activeProjectId: state.activeProjectId === id ? null : state.activeProjectId,
    }))
    get().saveProjects()
  },

  setActiveProject: (id) => {
    set({ activeProjectId: id })
  },

  updateProject: (id, updates) => {
    set((state) => ({
      projects: state.projects.map((p) =>
        p.id === id ? { ...p, ...updates } : p
      ),
    }))
    get().saveProjects()
  },

  setProjects: (projects) => {
    set({ projects, isLoaded: true })
  },

  loadProjects: async () => {
    try {
      const projects = await invoke<Project[]>('load_projects')
      set({ projects, isLoaded: true })
    } catch (error) {
      console.error('Failed to load projects:', error)
      set({ isLoaded: true })
    }
  },

  saveProjects: async () => {
    const { projects } = get()
    try {
      await invoke('save_projects', { projects })
    } catch (error) {
      console.error('Failed to save projects:', error)
    }
  },

  showProcessHistory: (projectId) => {
    set({ processHistoryProjectId: projectId })
  },

  hideProcessHistory: () => {
    set({ processHistoryProjectId: null })
  },
}))
