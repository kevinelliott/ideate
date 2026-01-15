import { useEffect, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'

interface ProcessCommand {
  executable: string
  args: string[]
  workingDirectory: string
}

interface ProcessHistoryEntry {
  processId: string
  projectId: string
  processType: string
  label: string
  startedAt: string
  completedAt: string
  durationMs: number
  exitCode: number | null
  success: boolean
  agentId?: string
  command?: ProcessCommand
  logFilePath?: string
}

interface ProcessHistory {
  entries: ProcessHistoryEntry[]
}

interface ProcessHistoryContentProps {
  projectId: string
}

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000)
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = seconds % 60
  if (minutes < 60) return `${minutes}m ${remainingSeconds}s`
  const hours = Math.floor(minutes / 60)
  const remainingMinutes = minutes % 60
  return `${hours}h ${remainingMinutes}m`
}

function formatDate(isoDate: string): string {
  const date = new Date(isoDate)
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function getProcessTypeLabel(type: string): string {
  switch (type) {
    case 'build': return 'Story Build'
    case 'prd': return 'PRD Generation'
    case 'chat': return 'Chat'
    case 'dev-server': return 'Dev Server'
    case 'detection': return 'Detection'
    default: return type
  }
}

function getProcessTypeColor(type: string): string {
  switch (type) {
    case 'build': return 'bg-accent/10 text-accent'
    case 'prd': return 'bg-purple-500/10 text-purple-500'
    case 'chat': return 'bg-blue-500/10 text-blue-500'
    case 'dev-server': return 'bg-orange-500/10 text-orange-500'
    case 'detection': return 'bg-muted/20 text-muted'
    default: return 'bg-muted/10 text-muted'
  }
}

function ProcessHistoryItem({ entry }: { entry: ProcessHistoryEntry }) {
  const [expanded, setExpanded] = useState(false)
  const [logContent, setLogContent] = useState<string | null>(null)
  const [loadingLog, setLoadingLog] = useState(false)

  const handleToggle = async () => {
    if (!expanded && entry.logFilePath && !logContent) {
      setLoadingLog(true)
      try {
        const content = await invoke<string>('read_process_log_file', {
          logFilePath: entry.logFilePath,
        })
        setLogContent(content)
      } catch (e) {
        console.error('Failed to read log file:', e)
        setLogContent('Failed to load log file')
      }
      setLoadingLog(false)
    }
    setExpanded(!expanded)
  }

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <button
        onClick={handleToggle}
        className="w-full px-4 py-3 flex items-center gap-3 hover:bg-card/50 transition-colors text-left"
      >
        <svg
          className={`w-4 h-4 text-muted transition-transform ${expanded ? 'rotate-90' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>

        <div className={`w-2 h-2 rounded-full flex-shrink-0 ${entry.success ? 'bg-success' : 'bg-destructive'}`} />

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-foreground truncate">{entry.label}</span>
            <span className={`text-xs px-1.5 py-0.5 rounded ${getProcessTypeColor(entry.processType)}`}>
              {getProcessTypeLabel(entry.processType)}
            </span>
          </div>
          <div className="flex items-center gap-3 text-xs text-muted mt-0.5">
            <span>{formatDate(entry.startedAt)}</span>
            <span>•</span>
            <span>{formatDuration(entry.durationMs)}</span>
            {entry.exitCode !== null && entry.exitCode !== 0 && (
              <>
                <span>•</span>
                <span className="text-destructive">Exit: {entry.exitCode}</span>
              </>
            )}
          </div>
        </div>

        {entry.agentId && (
          <span className="text-xs text-muted capitalize">{entry.agentId}</span>
        )}
      </button>

      {expanded && (
        <div className="px-4 pb-4 border-t border-border bg-background">
          <div className="mt-3 space-y-3">
            {/* Process details */}
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <span className="text-muted">Process ID:</span>
                <span className="ml-2 font-mono text-xs">{entry.processId.substring(0, 8)}</span>
              </div>
              <div>
                <span className="text-muted">Status:</span>
                <span className={`ml-2 ${entry.success ? 'text-success' : 'text-destructive'}`}>
                  {entry.success ? 'Success' : 'Failed'}
                </span>
              </div>
              <div>
                <span className="text-muted">Started:</span>
                <span className="ml-2">{new Date(entry.startedAt).toLocaleString()}</span>
              </div>
              <div>
                <span className="text-muted">Completed:</span>
                <span className="ml-2">{new Date(entry.completedAt).toLocaleString()}</span>
              </div>
            </div>

            {/* Command */}
            {entry.command && (
              <div>
                <div className="text-sm text-muted mb-1">Command:</div>
                <pre className="text-xs font-mono bg-card p-2 rounded border border-border overflow-x-auto">
                  {entry.command.executable} {entry.command.args.join(' ')}
                </pre>
                <div className="text-xs text-muted mt-1">
                  Working directory: {entry.command.workingDirectory}
                </div>
              </div>
            )}

            {/* Log content */}
            {entry.logFilePath && (
              <div>
                <div className="text-sm text-muted mb-1">Log output:</div>
                {loadingLog ? (
                  <div className="text-sm text-muted">Loading...</div>
                ) : logContent ? (
                  <pre className="text-xs font-mono bg-card p-3 rounded border border-border overflow-auto max-h-64 whitespace-pre-wrap">
                    {logContent}
                  </pre>
                ) : (
                  <div className="text-sm text-muted">No log file available</div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export function ProcessHistoryContent({ projectId }: ProcessHistoryContentProps) {
  const [history, setHistory] = useState<ProcessHistoryEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<string>('all')

  useEffect(() => {
    async function loadHistory() {
      setLoading(true)
      try {
        const result = await invoke<ProcessHistory>('load_process_history', { projectId })
        setHistory(result.entries)
      } catch (e) {
        console.error('Failed to load process history:', e)
      }
      setLoading(false)
    }
    loadHistory()
  }, [projectId])

  const filteredHistory = filter === 'all' 
    ? history 
    : history.filter((e) => e.processType === filter)

  const processTypes = Array.from(new Set(history.map((e) => e.processType)))

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-border bg-card flex-shrink-0">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">Process History</h2>
            <p className="text-sm text-muted mt-0.5">
              {history.length} {history.length === 1 ? 'process' : 'processes'} recorded
            </p>
          </div>

          {processTypes.length > 1 && (
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="bg-background border border-border rounded-lg px-3 py-1.5 text-sm"
            >
              <option value="all">All types</option>
              {processTypes.map((type) => (
                <option key={type} value={type}>
                  {getProcessTypeLabel(type)}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-6">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-muted">Loading history...</div>
          </div>
        ) : filteredHistory.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <svg
              className="w-12 h-12 text-muted mb-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <p className="text-muted">No process history yet</p>
            <p className="text-sm text-muted mt-1">
              Process runs will appear here after they complete
            </p>
          </div>
        ) : (
          <div className="max-w-4xl mx-auto space-y-2">
            {filteredHistory.map((entry) => (
              <ProcessHistoryItem key={entry.processId} entry={entry} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
