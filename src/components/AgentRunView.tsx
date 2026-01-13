import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useProcessStore, type RunningProcess, type ProcessLogEntry } from "../stores/processStore";
import { useBuildStore, type LogEntry } from "../stores/buildStore";
import { useProjectStore } from "../stores/projectStore";
import { useTheme } from "../hooks/useTheme";
import { getTerminalTheme } from "../utils/terminalThemes";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";

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
  
  // Get logs from buildStore for build processes
  const getProjectState = useBuildStore((state) => state.getProjectState);
  const projectState = getProjectState(process.projectId);
  const buildLogs = projectState.logs;
  
  // Get logs from processStore for non-build processes
  const processLogs = useProcessStore((state) => state.getProcessLogs(process.processId));
  
  // Use build logs for build/chat/prd processes, process logs for detection/dev-server
  const useBuildLogs = process.type === 'build' || process.type === 'chat' || process.type === 'prd';
  const logs: (LogEntry | ProcessLogEntry)[] = useBuildLogs ? buildLogs : processLogs;
  
  const selectProcess = useProcessStore((state) => state.selectProcess);
  const processes = useProcessStore((state) => state.processes);
  const isStillRunning = !!processes[process.processId];
  
  const { resolvedTheme } = useTheme();
  
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const lastLogCountRef = useRef(0);
  
  const [elapsedTime, setElapsedTime] = useState(0);

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

  // Initialize terminal
  useEffect(() => {
    if (!terminalRef.current) return;

    const terminal = new Terminal({
      theme: getTerminalTheme(resolvedTheme),
      fontSize: 13,
      fontFamily: '"SF Mono", "JetBrains Mono", "Monaco", "Menlo", monospace',
      cursorBlink: false,
      disableStdin: true,
      convertEol: true,
      scrollback: 10000,
      lineHeight: 1.4,
    });

    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);

    terminal.open(terminalRef.current);
    
    requestAnimationFrame(() => {
      fitAddon.fit();
    });

    xtermRef.current = terminal;
    fitAddonRef.current = fitAddon;

    terminal.onScroll(() => {
      if (!xtermRef.current) return;
      const buffer = xtermRef.current.buffer.active;
      const isAtBottom = buffer.viewportY >= buffer.baseY;
      setAutoScroll(isAtBottom);
    });

    const resizeObserver = new ResizeObserver(() => {
      requestAnimationFrame(() => {
        fitAddonRef.current?.fit();
      });
    });
    
    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }

    // Write existing logs
    lastLogCountRef.current = 0;
    for (const log of logs) {
      writeLogEntry(terminal, log);
    }
    lastLogCountRef.current = logs.length;
    if (autoScroll) {
      terminal.scrollToBottom();
    }

    return () => {
      resizeObserver.disconnect();
      terminal.dispose();
      xtermRef.current = null;
      fitAddonRef.current = null;
    };
  }, [resolvedTheme]);

  // Update terminal theme when resolved theme changes
  useEffect(() => {
    if (xtermRef.current) {
      const theme = getTerminalTheme(resolvedTheme);
      xtermRef.current.options.theme = theme;
      const rows = xtermRef.current.rows;
      xtermRef.current.refresh(0, rows - 1);
      if (fitAddonRef.current) {
        fitAddonRef.current.fit();
      }
    }
  }, [resolvedTheme]);

  // Stream new logs
  useEffect(() => {
    if (!xtermRef.current) return;

    const newLogs = logs.slice(lastLogCountRef.current);
    lastLogCountRef.current = logs.length;

    for (const log of newLogs) {
      writeLogEntry(xtermRef.current, log);
    }

    if (autoScroll) {
      xtermRef.current.scrollToBottom();
    }
  }, [logs, autoScroll]);

  const writeLogEntry = (terminal: Terminal, log: LogEntry | ProcessLogEntry) => {
    let prefix = "";
    const timestamp = log.timestamp.toLocaleTimeString();

    switch (log.type) {
      case "stdout":
        prefix = `\x1b[90m[${timestamp}]\x1b[0m `;
        break;
      case "stderr":
        prefix = `\x1b[90m[${timestamp}]\x1b[0m \x1b[31m`;
        break;
      case "system":
        prefix = `\x1b[90m[${timestamp}]\x1b[0m \x1b[32m`;
        break;
    }

    const suffix = log.type === "stdout" ? "" : "\x1b[0m";
    terminal.writeln(`${prefix}${log.content}${suffix}`);
  };

  const handleScrollToBottom = () => {
    setAutoScroll(true);
    xtermRef.current?.scrollToBottom();
  };

  const handleBack = () => {
    selectProcess(null);
  };

  const handleKillProcess = async () => {
    try {
      await invoke('kill_agent', { process_id: process.processId });
    } catch (error) {
      console.error('Failed to kill process:', error);
    }
  };

  // Format command for display
  const commandString = process.command 
    ? `${process.command.executable} ${process.command.args.join(' ')}`
    : null;

  return (
    <main className="flex-1 h-screen flex flex-col bg-background-secondary border-t border-border">
      {/* Drag region */}
      <div className="h-12 drag-region border-b border-border" />

      {/* Header */}
      <div className="flex items-center gap-4 px-6 py-4 border-b border-border bg-card">
        <button
          onClick={handleBack}
          className="p-1.5 rounded-lg text-muted hover:text-foreground hover:bg-background transition-colors"
          title="Back to project"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${
              isStillRunning ? 'bg-accent animate-pulse' : 'bg-muted'
            }`} />
            <h1 className="text-lg font-semibold truncate">{process.label}</h1>
            <span className="text-xs px-2 py-0.5 rounded-full bg-background text-muted">
              {getProcessTypeLabel(process.type)}
            </span>
          </div>
          <p className="text-sm text-muted mt-0.5">
            {project?.name || 'Unknown Project'}
          </p>
        </div>

        <div className="flex items-center gap-3">
          {isStillRunning && elapsedTime > 0 && (
            <div className="text-sm text-muted">
              ⏱ {formatDuration(elapsedTime)}
            </div>
          )}
          
          {isStillRunning && (
            <button
              onClick={handleKillProcess}
              className="px-3 py-1.5 rounded-lg text-sm font-medium bg-destructive/10 text-destructive hover:bg-destructive/20 transition-colors"
            >
              Stop
            </button>
          )}
          
          {!isStillRunning && (
            <span className="text-sm text-muted">Completed</span>
          )}
        </div>
      </div>

      {/* Process details */}
      <div className="px-6 py-3 border-b border-border bg-background">
        <div className="flex items-center gap-6 text-sm">
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
          {projectState.currentStoryId && useBuildLogs && (
            <div>
              <span className="text-muted">Story:</span>
              <span className="ml-2 text-foreground">{projectState.currentStoryTitle || projectState.currentStoryId}</span>
            </div>
          )}
        </div>
        
        {/* Command display */}
        {commandString && (
          <div className="mt-2 flex items-start gap-2">
            <span className="text-muted text-sm flex-shrink-0">Command:</span>
            <code className="text-xs font-mono text-foreground bg-card px-2 py-1 rounded border border-border break-all">
              {commandString}
            </code>
          </div>
        )}
        
        {/* Working directory */}
        {process.command?.workingDirectory && (
          <div className="mt-1 flex items-center gap-2 text-sm">
            <span className="text-muted">Directory:</span>
            <span className="text-xs font-mono text-muted truncate">{process.command.workingDirectory}</span>
          </div>
        )}
      </div>

      {/* Log output */}
      <div 
        ref={containerRef}
        className="flex-1 flex flex-col min-h-0 overflow-hidden"
      >
        <div className="flex items-center justify-between px-4 py-2 bg-background/50">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-muted uppercase tracking-wider">Output</span>
            {logs.length > 0 && (
              <span className="text-xs text-muted">({logs.length} lines)</span>
            )}
          </div>
          {!autoScroll && logs.length > 0 && (
            <button
              onClick={handleScrollToBottom}
              className="text-xs text-accent hover:text-accent/80 transition-colors"
            >
              Scroll to bottom
            </button>
          )}
        </div>
        
        <div
          ref={terminalRef}
          className="flex-1 overflow-hidden"
          style={{ padding: "8px 12px" }}
        />
      </div>
    </main>
  );
}
