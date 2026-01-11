import { create } from 'zustand'

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
  addProject: (project: Omit<Project, 'id' | 'createdAt'>) => Project
  removeProject: (id: string) => void
  setActiveProject: (id: string | null) => void
  updateProject: (id: string, updates: Partial<Project>) => void
}

export const useProjectStore = create<ProjectState>((set) => ({
  projects: [],
  activeProjectId: null,

  addProject: (projectData) => {
    const newProject: Project = {
      ...projectData,
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
    }
    set((state) => ({
      projects: [...state.projects, newProject],
    }))
    return newProject
  },

  removeProject: (id) => {
    set((state) => ({
      projects: state.projects.filter((p) => p.id !== id),
      activeProjectId: state.activeProjectId === id ? null : state.activeProjectId,
    }))
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
  },
}))
