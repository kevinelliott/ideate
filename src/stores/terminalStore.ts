import { create } from 'zustand'

interface TerminalSession {
  terminalId: string
  projectPath: string
  isActive: boolean
}

interface TerminalState {
  // Map of projectId -> terminal session
  sessions: Record<string, TerminalSession>
  
  // Track which project's terminal panel is currently expanded
  expandedProjectId: string | null
  
  // Register a terminal for a project
  registerTerminal: (projectId: string, terminalId: string, projectPath: string) => void
  
  // Unregister a terminal (when it exits or is killed)
  unregisterTerminal: (projectId: string) => void
  
  // Get terminal ID for a project
  getTerminalId: (projectId: string) => string | null
  
  // Check if a project has an active terminal
  hasTerminal: (projectId: string) => boolean
  
  // Set which project's terminal panel is expanded
  setExpandedProject: (projectId: string | null) => void
  
  // Mark terminal as inactive (exited)
  markTerminalExited: (terminalId: string) => void
}

export const useTerminalStore = create<TerminalState>((set, get) => ({
  sessions: {},
  expandedProjectId: null,

  registerTerminal: (projectId, terminalId, projectPath) => {
    set((state) => ({
      sessions: {
        ...state.sessions,
        [projectId]: {
          terminalId,
          projectPath,
          isActive: true,
        },
      },
    }))
  },

  unregisterTerminal: (projectId) => {
    set((state) => {
      const newSessions = { ...state.sessions }
      delete newSessions[projectId]
      return { sessions: newSessions }
    })
  },

  getTerminalId: (projectId) => {
    const session = get().sessions[projectId]
    return session?.isActive ? session.terminalId : null
  },

  hasTerminal: (projectId) => {
    const session = get().sessions[projectId]
    return session?.isActive ?? false
  },

  setExpandedProject: (projectId) => {
    set({ expandedProjectId: projectId })
  },

  markTerminalExited: (terminalId) => {
    set((state) => {
      const newSessions = { ...state.sessions }
      for (const [projectId, session] of Object.entries(newSessions)) {
        if (session.terminalId === terminalId) {
          newSessions[projectId] = { ...session, isActive: false }
          break
        }
      }
      return { sessions: newSessions }
    })
  },
}))
