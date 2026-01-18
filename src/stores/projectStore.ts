import { create } from 'zustand'
import { invoke } from '@tauri-apps/api/core'

export type ProjectStatus = 'idle' | 'generating' | 'ready' | 'error'
export type ProjectPage = 'overview' | 'requirements' | 'build-status' | 'process-history'

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
  buildStatusProjectId: string | null
  projectOverviewProjectId: string | null
  projectPages: Record<string, ProjectPage>
  isLoaded: boolean
  addProject: (project: Omit<Project, 'id' | 'createdAt'>) => Project
  removeProject: (id: string) => void
  setActiveProject: (id: string | null) => void
  updateProject: (id: string, updates: Partial<Project>) => void
  loadProjects: () => Promise<void>
  saveProjects: () => Promise<void>
  setProjects: (projects: Project[]) => void
  reorderProjects: (fromIndex: number, toIndex: number) => void
  showProcessHistory: (projectId: string) => void
  hideProcessHistory: () => void
  showBuildStatus: (projectId: string) => void
  hideBuildStatus: () => void
  showProjectOverview: (projectId: string) => void
  hideProjectOverview: () => void
  showRequirements: (projectId: string) => void
}

export const useProjectStore = create<ProjectState>((set, get) => ({
  projects: [],
  activeProjectId: null,
  processHistoryProjectId: null,
  buildStatusProjectId: null,
  projectOverviewProjectId: null,
  projectPages: {},
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
    if (id === null) {
      set({ activeProjectId: null, processHistoryProjectId: null, buildStatusProjectId: null, projectOverviewProjectId: null })
      return
    }
    const lastPage = get().projectPages[id] || 'overview'
    switch (lastPage) {
      case 'overview':
        set({ activeProjectId: id, projectOverviewProjectId: id, buildStatusProjectId: null, processHistoryProjectId: null })
        break
      case 'requirements':
        set({ activeProjectId: id, projectOverviewProjectId: null, buildStatusProjectId: null, processHistoryProjectId: null })
        break
      case 'build-status':
        set({ activeProjectId: id, buildStatusProjectId: id, projectOverviewProjectId: null, processHistoryProjectId: null })
        break
      case 'process-history':
        set({ activeProjectId: id, processHistoryProjectId: id, buildStatusProjectId: null, projectOverviewProjectId: null })
        break
    }
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

  reorderProjects: (fromIndex, toIndex) => {
    const { projects } = get()
    if (fromIndex < 0 || fromIndex >= projects.length || toIndex < 0 || toIndex >= projects.length) {
      return
    }
    const newProjects = [...projects]
    const [removed] = newProjects.splice(fromIndex, 1)
    newProjects.splice(toIndex, 0, removed)
    set({ projects: newProjects })
    get().saveProjects()
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
    set((state) => ({
      processHistoryProjectId: projectId,
      buildStatusProjectId: null,
      projectOverviewProjectId: null,
      activeProjectId: projectId,
      projectPages: { ...state.projectPages, [projectId]: 'process-history' },
    }))
  },

  hideProcessHistory: () => {
    set({ processHistoryProjectId: null })
  },

  showBuildStatus: (projectId) => {
    set((state) => ({
      buildStatusProjectId: projectId,
      projectOverviewProjectId: null,
      processHistoryProjectId: null,
      activeProjectId: projectId,
      projectPages: { ...state.projectPages, [projectId]: 'build-status' },
    }))
  },

  hideBuildStatus: () => {
    set({ buildStatusProjectId: null })
  },

  showProjectOverview: (projectId) => {
    set((state) => ({
      projectOverviewProjectId: projectId,
      buildStatusProjectId: null,
      processHistoryProjectId: null,
      activeProjectId: projectId,
      projectPages: { ...state.projectPages, [projectId]: 'overview' },
    }))
  },

  hideProjectOverview: () => {
    set({ projectOverviewProjectId: null })
  },

  showRequirements: (projectId) => {
    set((state) => ({
      activeProjectId: projectId,
      projectOverviewProjectId: null,
      buildStatusProjectId: null,
      processHistoryProjectId: null,
      projectPages: { ...state.projectPages, [projectId]: 'requirements' },
    }))
  },
}))
