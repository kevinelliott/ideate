import { create } from 'zustand'
import { invoke } from '@tauri-apps/api/core'

export interface CostEntry {
  id: string
  projectId: string
  timestamp: Date | string
  agentId: string
  description: string
  inputTokens?: number
  outputTokens?: number
  totalTokens?: number
  cost?: number
  credits?: number
  model?: string
  threadId?: string
  durationMs?: number
  rawOutput?: string
}

interface PersistedCostEntry {
  id: string
  projectId: string
  timestamp: string
  agentId: string
  description: string
  inputTokens?: number | null
  outputTokens?: number | null
  totalTokens?: number | null
  cost?: number | null
  credits?: number | null
  model?: string | null
  threadId?: string | null
  durationMs?: number | null
}

interface CostHistory {
  entries: PersistedCostEntry[]
}

export interface ProjectCostSummary {
  totalCost: number
  totalCredits: number
  totalInputTokens: number
  totalOutputTokens: number
  totalTokens: number
  entryCount: number
}

export interface AmpUsageEntry {
  threadId: string
  threadTitle: string | null
  timestamp: string
  model: string | null
  inputTokens: number
  outputTokens: number
  totalTokens: number
  cacheCreationTokens: number
  cacheReadTokens: number
  credits: number
  durationMs: number
}

export interface AmpUsageSummary {
  entries: AmpUsageEntry[]
  totalInputTokens: number
  totalOutputTokens: number
  totalTokens: number
  totalCredits: number
  totalDurationMs: number
  threadCount: number
}

export interface ClaudeUsageEntry {
  sessionId: string
  projectPath: string
  timestamp: string
  model: string | null
  inputTokens: number
  outputTokens: number
  totalTokens: number
  cacheCreationTokens: number
  cacheReadTokens: number
  durationMs: number
  serviceTier: string | null
}

export interface ClaudeUsageSummary {
  entries: ClaudeUsageEntry[]
  totalInputTokens: number
  totalOutputTokens: number
  totalTokens: number
  totalDurationMs: number
  sessionCount: number
  detectedTier: string | null
}

interface RecentThreadDuration {
  threadId: string | null
  durationMs: number
}

interface CostStore {
  entries: CostEntry[]
  ampUsage: AmpUsageSummary | null
  claudeUsage: ClaudeUsageSummary | null
  isLoadingAmpUsage: boolean
  isLoadingClaudeUsage: boolean
  loadedProjects: Set<string>
  
  addEntry: (entry: Omit<CostEntry, 'id' | 'timestamp'>, projectPath?: string) => void
  getEntriesByProject: (projectId: string) => CostEntry[]
  getProjectSummary: (projectId: string) => ProjectCostSummary
  getTotalSummary: () => ProjectCostSummary
  clearEntries: (projectId?: string, projectPath?: string) => void
  recordAgentRun: (projectId: string, projectPath: string, agentId: string, description: string, output?: string, durationMs?: number) => Promise<void>
  parseAndAddFromOutput: (projectId: string, projectPath: string, agentId: string, description: string, output: string, durationMs?: number) => void
  loadProjectCostHistory: (projectId: string, projectPath: string) => Promise<void>
  saveProjectCostHistory: (projectId: string, projectPath: string) => Promise<void>
  loadAmpUsage: (sinceTimestamp?: number) => Promise<AmpUsageSummary | null>
  refreshAmpUsage: () => Promise<AmpUsageSummary | null>
  loadClaudeUsage: (sinceTimestamp?: number) => Promise<ClaudeUsageSummary | null>
  refreshClaudeUsage: () => Promise<ClaudeUsageSummary | null>
  loadAllAgentUsage: (sinceTimestamp?: number) => Promise<void>
  refreshAllAgentUsage: () => Promise<void>
}

// Regex patterns to extract cost/token info from various agent outputs
const COST_PATTERNS = {
  cost: /(?:total\s+)?cost[:\s]+\$?([\d.]+)/i,
  inputTokens: /input\s*tokens?[:\s]+([\d,]+)/i,
  outputTokens: /output\s*tokens?[:\s]+([\d,]+)/i,
  totalTokens: /total\s*tokens?[:\s]+([\d,]+)/i,
  tokenPair: /([\d,]+)\s*input\s*[\/|]\s*([\d,]+)\s*output/i,
  tokensUsed: /tokens?\s*used[:\s]+([\d,]+)/i,
}

function parseNumber(str: string): number {
  return parseInt(str.replace(/,/g, ''), 10)
}

function extractCostInfo(output: string): Partial<Pick<CostEntry, 'inputTokens' | 'outputTokens' | 'totalTokens' | 'cost'>> {
  const result: Partial<Pick<CostEntry, 'inputTokens' | 'outputTokens' | 'totalTokens' | 'cost'>> = {}
  
  const costMatch = output.match(COST_PATTERNS.cost)
  if (costMatch) {
    result.cost = parseFloat(costMatch[1])
  }
  
  const inputMatch = output.match(COST_PATTERNS.inputTokens)
  if (inputMatch) {
    result.inputTokens = parseNumber(inputMatch[1])
  }
  
  const outputMatch = output.match(COST_PATTERNS.outputTokens)
  if (outputMatch) {
    result.outputTokens = parseNumber(outputMatch[1])
  }
  
  const totalMatch = output.match(COST_PATTERNS.totalTokens)
  if (totalMatch) {
    result.totalTokens = parseNumber(totalMatch[1])
  }
  
  if (!result.inputTokens && !result.outputTokens) {
    const pairMatch = output.match(COST_PATTERNS.tokenPair)
    if (pairMatch) {
      result.inputTokens = parseNumber(pairMatch[1])
      result.outputTokens = parseNumber(pairMatch[2])
    }
  }
  
  if (!result.totalTokens) {
    const usedMatch = output.match(COST_PATTERNS.tokensUsed)
    if (usedMatch) {
      result.totalTokens = parseNumber(usedMatch[1])
    }
  }
  
  if (result.inputTokens && result.outputTokens && !result.totalTokens) {
    result.totalTokens = result.inputTokens + result.outputTokens
  }
  
  return result
}

function toPersistedEntry(entry: CostEntry): PersistedCostEntry {
  return {
    id: entry.id,
    projectId: entry.projectId,
    timestamp: entry.timestamp instanceof Date ? entry.timestamp.toISOString() : entry.timestamp,
    agentId: entry.agentId,
    description: entry.description,
    inputTokens: entry.inputTokens ?? null,
    outputTokens: entry.outputTokens ?? null,
    totalTokens: entry.totalTokens ?? null,
    cost: entry.cost ?? null,
    credits: entry.credits ?? null,
    model: entry.model ?? null,
    threadId: entry.threadId ?? null,
    durationMs: entry.durationMs ?? null,
  }
}

function fromPersistedEntry(entry: PersistedCostEntry): CostEntry {
  return {
    id: entry.id,
    projectId: entry.projectId,
    timestamp: new Date(entry.timestamp),
    agentId: entry.agentId,
    description: entry.description,
    inputTokens: entry.inputTokens ?? undefined,
    outputTokens: entry.outputTokens ?? undefined,
    totalTokens: entry.totalTokens ?? undefined,
    cost: entry.cost ?? undefined,
    credits: entry.credits ?? undefined,
    model: entry.model ?? undefined,
    threadId: entry.threadId ?? undefined,
    durationMs: entry.durationMs ?? undefined,
  }
}

export const useCostStore = create<CostStore>((set, get) => ({
  entries: [],
  ampUsage: null,
  claudeUsage: null,
  isLoadingAmpUsage: false,
  isLoadingClaudeUsage: false,
  loadedProjects: new Set<string>(),

  addEntry: (entry, projectPath) => {
    const newEntry: CostEntry = {
      ...entry,
      id: crypto.randomUUID(),
      timestamp: new Date(),
    }
    set((state) => ({
      entries: [...state.entries, newEntry],
    }))
    
    if (projectPath) {
      get().saveProjectCostHistory(entry.projectId, projectPath)
    }
  },

  getEntriesByProject: (projectId) => {
    return get().entries.filter((e) => e.projectId === projectId)
  },

  getProjectSummary: (projectId) => {
    const entries = get().getEntriesByProject(projectId)
    return entries.reduce(
      (acc, entry) => ({
        totalCost: acc.totalCost + (entry.cost || 0),
        totalCredits: acc.totalCredits + (entry.credits || 0),
        totalInputTokens: acc.totalInputTokens + (entry.inputTokens || 0),
        totalOutputTokens: acc.totalOutputTokens + (entry.outputTokens || 0),
        totalTokens: acc.totalTokens + (entry.totalTokens || 0),
        entryCount: acc.entryCount + 1,
      }),
      { totalCost: 0, totalCredits: 0, totalInputTokens: 0, totalOutputTokens: 0, totalTokens: 0, entryCount: 0 }
    )
  },

  getTotalSummary: () => {
    return get().entries.reduce(
      (acc, entry) => ({
        totalCost: acc.totalCost + (entry.cost || 0),
        totalCredits: acc.totalCredits + (entry.credits || 0),
        totalInputTokens: acc.totalInputTokens + (entry.inputTokens || 0),
        totalOutputTokens: acc.totalOutputTokens + (entry.outputTokens || 0),
        totalTokens: acc.totalTokens + (entry.totalTokens || 0),
        entryCount: acc.entryCount + 1,
      }),
      { totalCost: 0, totalCredits: 0, totalInputTokens: 0, totalOutputTokens: 0, totalTokens: 0, entryCount: 0 }
    )
  },

  clearEntries: (projectId, projectPath) => {
    if (projectId) {
      set((state) => ({
        entries: state.entries.filter((e) => e.projectId !== projectId),
      }))
      if (projectPath) {
        invoke('save_cost_history', {
          projectPath,
          history: { entries: [] },
        }).catch(console.error)
      }
    } else {
      set({ entries: [] })
    }
  },

  recordAgentRun: async (projectId, projectPath, agentId, description, output, durationMs) => {
    const costInfo = output ? extractCostInfo(output) : {}
    
    // If no manual duration provided, try to get it from agent thread/session files
    let finalDuration = durationMs
    if (!finalDuration) {
      try {
        if (agentId === 'amp') {
          const result = await invoke<RecentThreadDuration>('get_recent_amp_thread_duration', {
            sinceMs: Date.now() - 60000, // Look for threads modified in last minute
          })
          if (result.durationMs > 0) {
            finalDuration = result.durationMs
          }
        } else if (agentId === 'claude-code') {
          const result = await invoke<RecentThreadDuration>('get_recent_claude_session_duration', {
            sinceMs: Date.now() - 60000, // Look for sessions modified in last minute
          })
          if (result.durationMs > 0) {
            finalDuration = result.durationMs
          }
        }
      } catch (e) {
        console.warn('Failed to get agent thread/session duration:', e)
      }
    }
    
    get().addEntry({
      projectId,
      agentId,
      description,
      durationMs: finalDuration,
      ...costInfo,
    }, projectPath)
  },

  parseAndAddFromOutput: (projectId, projectPath, agentId, description, output, durationMs) => {
    get().recordAgentRun(projectId, projectPath, agentId, description, output, durationMs)
  },

  loadProjectCostHistory: async (projectId, projectPath) => {
    const { loadedProjects } = get()
    if (loadedProjects.has(projectId)) {
      return
    }

    try {
      const history = await invoke<CostHistory>('load_cost_history', { projectPath })
      const loadedEntries = history.entries
        .filter((e) => e.projectId === projectId)
        .map(fromPersistedEntry)
      
      set((state) => {
        const existingIds = new Set(state.entries.map((e) => e.id))
        const newEntries = loadedEntries.filter((e) => !existingIds.has(e.id))
        const newLoadedProjects = new Set(state.loadedProjects)
        newLoadedProjects.add(projectId)
        
        return {
          entries: [...state.entries, ...newEntries],
          loadedProjects: newLoadedProjects,
        }
      })
    } catch (error) {
      console.error('Failed to load project cost history:', error)
    }
  },

  saveProjectCostHistory: async (projectId, projectPath) => {
    const projectEntries = get().getEntriesByProject(projectId)
    const persistedEntries = projectEntries.map(toPersistedEntry)
    
    try {
      await invoke('save_cost_history', {
        projectPath,
        history: { entries: persistedEntries },
      })
    } catch (error) {
      console.error('Failed to save project cost history:', error)
    }
  },

  loadAmpUsage: async (sinceTimestamp?: number) => {
    set({ isLoadingAmpUsage: true })
    try {
      const usage = await invoke<AmpUsageSummary>('load_amp_usage', {
        sinceTimestamp: sinceTimestamp ?? null,
      })
      set({ ampUsage: usage, isLoadingAmpUsage: false })
      return usage
    } catch (error) {
      console.error('Failed to load Amp usage:', error)
      set({ isLoadingAmpUsage: false })
      return null
    }
  },

  refreshAmpUsage: async () => {
    set({ ampUsage: null, isLoadingAmpUsage: true })
    try {
      const usage = await invoke<AmpUsageSummary>('load_amp_usage', {
        sinceTimestamp: null,
      })
      set({ ampUsage: usage, isLoadingAmpUsage: false })
      return usage
    } catch (error) {
      console.error('Failed to refresh Amp usage:', error)
      set({ isLoadingAmpUsage: false })
      return null
    }
  },

  loadClaudeUsage: async (sinceTimestamp?: number) => {
    set({ isLoadingClaudeUsage: true })
    try {
      const usage = await invoke<ClaudeUsageSummary>('load_claude_usage', {
        sinceTimestamp: sinceTimestamp ?? null,
      })
      set({ claudeUsage: usage, isLoadingClaudeUsage: false })
      return usage
    } catch (error) {
      console.error('Failed to load Claude Code usage:', error)
      set({ isLoadingClaudeUsage: false })
      return null
    }
  },

  refreshClaudeUsage: async () => {
    set({ claudeUsage: null, isLoadingClaudeUsage: true })
    try {
      const usage = await invoke<ClaudeUsageSummary>('load_claude_usage', {
        sinceTimestamp: null,
      })
      set({ claudeUsage: usage, isLoadingClaudeUsage: false })
      return usage
    } catch (error) {
      console.error('Failed to refresh Claude Code usage:', error)
      set({ isLoadingClaudeUsage: false })
      return null
    }
  },

  loadAllAgentUsage: async (sinceTimestamp?: number) => {
    await Promise.all([
      get().loadAmpUsage(sinceTimestamp),
      get().loadClaudeUsage(sinceTimestamp),
    ])
  },

  refreshAllAgentUsage: async () => {
    await Promise.all([
      get().refreshAmpUsage(),
      get().refreshClaudeUsage(),
    ])
  },
}))
