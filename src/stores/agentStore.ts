import { create } from 'zustand'

export interface AgentMessage {
  id: string
  role: 'user' | 'agent' | 'system'
  content: string
  timestamp: Date
}

export interface AgentSession {
  processId: string | null
  isRunning: boolean
  messages: AgentMessage[]
  agentId: string
}

const DEFAULT_AGENT_ID = 'claude-code'

const createEmptySession = (agentId: string = DEFAULT_AGENT_ID): AgentSession => ({
  processId: null,
  isRunning: false,
  messages: [],
  agentId,
})

interface AgentStore {
  sessions: Record<string, AgentSession>
  defaultAgentId: string
  
  setDefaultAgentId: (agentId: string) => void
  getSession: (projectId: string) => AgentSession
  initSession: (projectId: string) => void
  setAgentId: (projectId: string, agentId: string) => void
  setProcessId: (projectId: string, processId: string | null) => void
  setIsRunning: (projectId: string, isRunning: boolean) => void
  addMessage: (projectId: string, message: Omit<AgentMessage, 'id' | 'timestamp'>) => void
  appendToLastMessage: (projectId: string, content: string) => void
  clearMessages: (projectId: string) => void
  resetSession: (projectId: string) => void
}

export const useAgentStore = create<AgentStore>((set, get) => ({
  sessions: {},
  defaultAgentId: DEFAULT_AGENT_ID,

  setDefaultAgentId: (agentId) => {
    set({ defaultAgentId: agentId })
  },

  getSession: (projectId) => {
    const state = get()
    return state.sessions[projectId] || createEmptySession(state.defaultAgentId)
  },

  initSession: (projectId) => {
    const state = get()
    if (!state.sessions[projectId]) {
      set((s) => ({
        sessions: {
          ...s.sessions,
          [projectId]: createEmptySession(s.defaultAgentId),
        },
      }))
    }
  },

  setAgentId: (projectId, agentId) => {
    set((state) => ({
      sessions: {
        ...state.sessions,
        [projectId]: {
          ...(state.sessions[projectId] || createEmptySession(state.defaultAgentId)),
          agentId,
        },
      },
    }))
  },

  setProcessId: (projectId, processId) => {
    set((state) => ({
      sessions: {
        ...state.sessions,
        [projectId]: {
          ...(state.sessions[projectId] || createEmptySession(state.defaultAgentId)),
          processId,
        },
      },
    }))
  },

  setIsRunning: (projectId, isRunning) => {
    set((state) => ({
      sessions: {
        ...state.sessions,
        [projectId]: {
          ...(state.sessions[projectId] || createEmptySession(state.defaultAgentId)),
          isRunning,
        },
      },
    }))
  },

  addMessage: (projectId, message) => {
    const newMessage: AgentMessage = {
      ...message,
      id: crypto.randomUUID(),
      timestamp: new Date(),
    }
    set((state) => {
      const session = state.sessions[projectId] || createEmptySession(state.defaultAgentId)
      return {
        sessions: {
          ...state.sessions,
          [projectId]: {
            ...session,
            messages: [...session.messages, newMessage],
          },
        },
      }
    })
  },

  appendToLastMessage: (projectId, content) => {
    set((state) => {
      const session = state.sessions[projectId]
      if (!session || session.messages.length === 0) return state
      
      const messages = [...session.messages]
      const lastMessage = messages[messages.length - 1]
      if (lastMessage.role === 'agent') {
        messages[messages.length - 1] = {
          ...lastMessage,
          content: lastMessage.content + content,
        }
      }
      
      return {
        sessions: {
          ...state.sessions,
          [projectId]: {
            ...session,
            messages,
          },
        },
      }
    })
  },

  clearMessages: (projectId) => {
    set((state) => ({
      sessions: {
        ...state.sessions,
        [projectId]: {
          ...(state.sessions[projectId] || createEmptySession(state.defaultAgentId)),
          messages: [],
        },
      },
    }))
  },

  resetSession: (projectId) => {
    set((state) => ({
      sessions: {
        ...state.sessions,
        [projectId]: createEmptySession(state.defaultAgentId),
      },
    }))
  },
}))
