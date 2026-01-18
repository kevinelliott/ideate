import { useEffect, useRef, useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useProcessStore, type RunningProcess, type ProcessLogEntry } from "../stores/processStore";
import { useBuildStore, type LogEntry } from "../stores/buildStore";
import { useProjectStore } from "../stores/projectStore";
import { StreamLogEntry } from "./StreamLogEntry";
import { notify } from "../utils/notify";

interface AgentRunViewProps {
  process: RunningProcess;
}

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (minutes < 60) return `${minutes}m ${remainingSeconds}s`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${hours}h ${remainingMinutes}m`;
}

function shellQuoteArg(arg: string): string {
  if (arg === '') {
    return "''"
  }
  if (/^[a-zA-Z0-9_./:@=-]+$/.test(arg)) {
    return arg;
  }
  if (arg.includes('\n') || arg.includes('\t') || arg.includes('\r')) {
    const escaped = arg
      .replace(/\\/g, '\\\\')
      .replace(/'/g, "\\'")
      .replace(/\n/g, '\\n')
      .replace(/\t/g, '\\t')
      .replace(/\r/g, '\\r')
    return `$'${escaped}'`
  }
  return `'${arg.replace(/'/g, "'\\''")}'`;
}

function formatCommand(executable: string, args: string[]): string {
  const quotedArgs = args.map(shellQuoteArg);
  return `${executable} ${quotedArgs.join(" ")}`;
}

function getProcessTypeLabel(type: string): string {
  switch (type) {
    case 'build': return 'Story Build';
    case 'prd': return 'PRD Generation';
    case 'chat': return 'Chat';
    case 'dev-server': return 'Dev Server';
    case 'detection': return 'Detection';
    default: return type;
  }
}

export function AgentRunView({ process }: AgentRunViewProps) {
  const projects = useProjectStore((state) => state.projects);
  const project = projects.find((p) => p.id === process.projectId);
  
  const projectState = useBuildStore((state) => state.projectStates[process.projectId]);
  const buildLogs = projectState?.logs ?? [];
  
  const processLogs = useProcessStore((state) => state.getProcessLogs(process.processId));
  
  const useBuildLogs = process.type === 'build' || process.type === 'chat' || process.type === 'prd';
  const logs: (LogEntry | ProcessLogEntry)[] = useBuildLogs ? buildLogs : processLogs;
  
  const selectProcess = useProcessStore((state) => state.selectProcess);
  const processes = useProcessStore((state) => state.processes);
  const isStillRunning = !!processes[process.processId];
  
  const scrollRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [commandExpanded, setCommandExpanded] = useState(false);
  const [isStopping, setIsStopping] = useState(false);

  // Update elapsed time
  useEffect(() => {
    if (!isStillRunning) return;
    
    const updateElapsed = () => {
      setElapsedTime(Date.now() - process.startedAt.getTime());
    };
    
    updateElapsed();
    const interval = setInterval(updateElapsed, 1000);
    
    return () => clearInterval(interval);
  }, [process.startedAt, isStillRunning]);

  // Auto-scroll when new logs arrive
  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs, autoScroll]);

  const handleScroll = useCallback(() => {
    if (!scrollRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 50;
    setAutoScroll(isAtBottom);
  }, []);

  const handleScrollToBottom = () => {
    setAutoScroll(true);
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  };

  const handleBack = () => {
    selectProcess(null);
  };

  const handleKillProcess = async () => {
    if (isStopping) return;
    
    setIsStopping(true);
    try {
      const result = await invoke<{ success: boolean; message: string }>('kill_agent', { 
        processId: process.processId 
      });
      if (result.success) {
        notify.info('Process stopped', result.message);
      } else {
        notify.warning('Stop failed', result.message);
      }
    } catch (error) {
      console.error('Failed to kill process:', error);
      notify.error('Failed to stop process', String(error));
    } finally {
      setIsStopping(false);
    }
  };

  const handleCopyCommand = async () => {
    if (commandString) {
      try {
        await navigator.clipboard.writeText(commandString);
      } catch (error) {
        console.error('Failed to copy command:', error);
      }
    }
  };

  const handleCopyOutput = async () => {
    if (logs.length === 0) return;
    try {
      const outputText = logs.map(log => {
        const timestamp = log.timestamp.toLocaleTimeString();
        const prefix = log.type === 'stderr' ? '[ERR]' : log.type === 'system' ? '[SYS]' : '[OUT]';
        return `[${timestamp}] ${prefix} ${log.content}`;
      }).join('\n');
      await navigator.clipboard.writeText(outputText);
    } catch (error) {
      console.error('Failed to copy output:', error);
    }
  };

  const commandString = process.command 
    ? formatCommand(process.command.executable, process.command.args)
    : null;

  const isLongCommand = commandString && (commandString.length > 200 || commandString.includes('\n'));

  return (
    <main className="flex-1 h-screen flex flex-col bg-background-secondary border-t border-border overflow-hidden">
      {/* Top bar */}
      <div className="h-12 flex items-center justify-between px-4 border-b border-border bg-background drag-region">
        <div className="flex items-center gap-3 no-drag">
          <button
            onClick={handleBack}
            className="p-1 rounded text-muted hover:text-foreground hover:bg-card transition-colors"
            title="Back to project"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <h1 className="text-sm font-medium text-foreground truncate max-w-[200px]">
            {project?.name || 'Unknown Project'}
          </h1>
          {project?.description && (
            <span className="text-xs text-muted truncate max-w-[300px] hidden lg:block">
              {project.description}
            </span>
          )}
        </div>

        <div className="flex items-center gap-3 no-drag">
          {isStillRunning && elapsedTime > 0 && (
            <div className="text-xs text-muted">
              ⏱ {formatDuration(elapsedTime)}
            </div>
          )}
          
          {isStillRunning && (
            <button
              onClick={handleKillProcess}
              disabled={isStopping}
              className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
                isStopping 
                  ? 'bg-muted/10 text-muted cursor-not-allowed' 
                  : 'bg-destructive/10 text-destructive hover:bg-destructive/20'
              }`}
            >
              {isStopping ? 'Stopping...' : 'Stop'}
            </button>
          )}
          
          {!isStillRunning && (
            <span className="text-xs text-muted">Completed</span>
          )}
        </div>
      </div>

      {/* Process header */}
      <div className="flex items-center gap-4 px-6 py-3 border-b border-border bg-card flex-shrink-0">
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${
            isStillRunning ? 'bg-accent animate-pulse' : 'bg-muted'
          }`} />
          <h2 className="text-base font-medium truncate">{process.label}</h2>
          <span className="text-xs px-2 py-0.5 rounded-full bg-background text-muted">
            {getProcessTypeLabel(process.type)}
          </span>
        </div>
      </div>

      {/* Process details */}
      <div className="px-6 py-3 border-b border-border bg-background flex-shrink-0 overflow-hidden">
        <div className="flex items-center gap-6 text-sm flex-wrap">
          <div>
            <span className="text-muted">Process ID:</span>
            <span className="ml-2 font-mono text-xs text-foreground">{process.processId.substring(0, 8)}</span>
          </div>
          <div>
            <span className="text-muted">Started:</span>
            <span className="ml-2 text-foreground">{process.startedAt.toLocaleTimeString()}</span>
          </div>
          {process.agentId && (
            <div>
              <span className="text-muted">Agent:</span>
              <span className="ml-2 text-foreground capitalize">{process.agentId}</span>
            </div>
          )}
          {projectState?.currentStoryId && useBuildLogs && (
            <div>
              <span className="text-muted">Story:</span>
              <span className="ml-2 text-foreground">{projectState.currentStoryTitle || projectState.currentStoryId}</span>
            </div>
          )}
        </div>
        
        {/* Command display */}
        {commandString && (
          <div className="mt-3 min-w-0">
            <div className="flex items-center justify-between mb-1">
              <span className="text-muted text-sm">Command:</span>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleCopyCommand}
                  className="p-1 text-muted hover:text-foreground transition-colors"
                  title="Copy command"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                </button>
                {isLongCommand && (
                  <button
                    onClick={() => setCommandExpanded(!commandExpanded)}
                    className="text-xs text-accent hover:text-accent/80 transition-colors"
                  >
                    {commandExpanded ? 'Collapse' : 'Expand'}
                  </button>
                )}
              </div>
            </div>
            <pre 
              className={`text-xs font-mono text-foreground bg-card px-3 py-2 rounded border border-border ${
                commandExpanded 
                  ? 'whitespace-pre-wrap break-all' 
                  : 'whitespace-nowrap overflow-hidden text-ellipsis'
              }`}
            >
              {commandString}
            </pre>
          </div>
        )}
        
        {/* Working directory */}
        {process.command?.workingDirectory && (
          <div className="mt-2 flex items-center gap-2 text-sm min-w-0">
            <span className="text-muted flex-shrink-0">Directory:</span>
            <span className="text-xs font-mono text-muted truncate">{process.command.workingDirectory}</span>
          </div>
        )}
      </div>

      {/* Log output */}
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-2 bg-background/50 flex-shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-muted uppercase tracking-wider">Output</span>
            {logs.length > 0 && (
              <span className="text-xs text-muted">({logs.length} lines)</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {!autoScroll && logs.length > 0 && (
              <button
                onClick={handleScrollToBottom}
                className="text-xs text-accent hover:text-accent/80 transition-colors"
              >
                Scroll to bottom
              </button>
            )}
            {logs.length > 0 && (
              <button
                onClick={handleCopyOutput}
                className="p-1 text-muted hover:text-foreground transition-colors"
                title="Copy output"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              </button>
            )}
          </div>
        </div>
        
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto px-4 py-2 font-mono text-sm space-y-1 select-text"
        >
          {logs.length === 0 && (
            <div className="flex items-center justify-center h-full text-muted text-sm">
              Waiting for output...
            </div>
          )}
          {logs.map((log, index) => (
            <StreamLogEntry
              key={index}
              content={log.content}
              timestamp={log.timestamp}
              type={log.type}
            />
          ))}
        </div>
      </div>
    </main>
  );
}
