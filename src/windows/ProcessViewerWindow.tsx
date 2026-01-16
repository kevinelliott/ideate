import { useEffect, useState, useRef } from "react";
import { listen, emit } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { useThemeStore } from "../stores/themeStore";
import type { RunningProcess } from "../stores/processStore";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { getTerminalTheme } from "../utils/terminalThemes";
import "@xterm/xterm/css/xterm.css";

interface AgentOutputPayload {
  processId: string;
  streamType: "stdout" | "stderr";
  content: string;
}

interface AgentExitPayload {
  processId: string;
  exitCode: number | null;
  success: boolean;
}

interface ProcessRegisteredPayload {
  process: {
    processId: string;
    projectId: string;
    projectName?: string;
    type: string;
    label: string;
    startedAt: string;
    agentId?: string;
    command?: {
      executable: string;
      args: string[];
      workingDirectory: string;
    };
    url?: string;
  };
}

interface ProcessUnregisteredPayload {
  processId: string;
  exitCode?: number | null;
  success?: boolean;
}

interface ProcessListSyncPayload {
  processes: Array<{
    processId: string;
    projectId: string;
    projectName?: string;
    type: string;
    label: string;
    startedAt: string;
    agentId?: string;
    command?: {
      executable: string;
      args: string[];
      workingDirectory: string;
    };
    url?: string;
  }>;
  logs: Record<string, { type: string; content: string }[]>;
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

function formatProcessType(type: string): string {
  switch (type) {
    case "prd": return "PRD";
    case "dev-server": return "Dev Server";
    default: return type.charAt(0).toUpperCase() + type.slice(1);
  }
}

function ProcessTypeIcon({ type }: { type: string }) {
  switch (type) {
    case "build":
      return (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
        </svg>
      );
    case "prd":
      return (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      );
    case "dev-server":
      return (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01" />
        </svg>
      );
    case "tunnel":
      return (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
        </svg>
      );
    default:
      return (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      );
  }
}

interface ProcessRowProps {
  process: RunningProcess;
  isSelected: boolean;
  onSelect: () => void;
}

function ProcessRow({ process, isSelected, onSelect }: ProcessRowProps) {
  const [elapsed, setElapsed] = useState(Date.now() - process.startedAt.getTime());

  useEffect(() => {
    const interval = setInterval(() => {
      setElapsed(Date.now() - process.startedAt.getTime());
    }, 1000);
    return () => clearInterval(interval);
  }, [process.startedAt]);

  return (
    <button
      onClick={onSelect}
      className={`w-full px-3 py-2 flex items-center gap-3 text-left transition-colors ${
        isSelected
          ? "bg-accent/10 border-l-2 border-accent"
          : "hover:bg-background-secondary border-l-2 border-transparent"
      }`}
    >
      <div className="text-muted">
        <ProcessTypeIcon type={process.type} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-foreground truncate">
          {process.label}
        </div>
        <div className="text-xs text-muted flex items-center gap-2">
          {process.projectName && (
            <>
              <span className="truncate max-w-[100px]" title={process.projectName}>{process.projectName}</span>
              <span>•</span>
            </>
          )}
          <span>{formatProcessType(process.type)}</span>
          <span>•</span>
          <span>{formatDuration(elapsed)}</span>
        </div>
      </div>
      <div className="w-2 h-2 rounded-full bg-success animate-pulse" title="Running" />
    </button>
  );
}

interface ProcessDetailProps {
  process: RunningProcess;
  logs: { type: string; content: string }[];
  onStop: () => void;
}

function ProcessDetail({ process, logs, onStop }: ProcessDetailProps) {
  const { resolvedMode } = useThemeStore();
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const lastLogCountRef = useRef(0);
  const [isStopping, setIsStopping] = useState(false);

  useEffect(() => {
    if (!terminalRef.current) return;

    const terminal = new Terminal({
      theme: getTerminalTheme(resolvedMode),
      fontSize: 12,
      fontFamily: '"SF Mono", "JetBrains Mono", monospace',
      cursorBlink: false,
      disableStdin: true,
      convertEol: true,
      scrollback: 5000,
      lineHeight: 1.3,
    });

    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);
    terminal.open(terminalRef.current);

    setTimeout(() => fitAddon.fit(), 0);
    xtermRef.current = terminal;
    fitAddonRef.current = fitAddon;

    const resizeObserver = new ResizeObserver(() => {
      fitAddon.fit();
    });
    resizeObserver.observe(terminalRef.current);

    return () => {
      resizeObserver.disconnect();
      terminal.dispose();
    };
  }, [resolvedMode]);

  useEffect(() => {
    const terminal = xtermRef.current;
    if (!terminal) return;

    const newLogs = logs.slice(lastLogCountRef.current);
    for (const log of newLogs) {
      terminal.writeln(log.content);
    }
    lastLogCountRef.current = logs.length;
  }, [logs]);

  const handleStop = async () => {
    if (isStopping) return;
    setIsStopping(true);
    try {
      await invoke("kill_agent", { processId: process.processId });
      onStop();
    } catch (error) {
      console.error("Failed to stop process:", error);
    } finally {
      setIsStopping(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between p-4 border-b border-border">
        <div>
          <h2 className="text-lg font-semibold text-foreground">{process.label}</h2>
          <div className="text-sm text-muted flex items-center gap-2">
            <span>{formatProcessType(process.type)}</span>
            {process.agentId && (
              <>
                <span>•</span>
                <span className="capitalize">{process.agentId}</span>
              </>
            )}
          </div>
        </div>
        <button
          onClick={handleStop}
          disabled={isStopping}
          className="px-3 py-1.5 text-sm bg-destructive/10 text-destructive hover:bg-destructive/20 rounded transition-colors disabled:opacity-50"
        >
          {isStopping ? "Stopping..." : "Stop"}
        </button>
      </div>
      <div ref={terminalRef} className="flex-1 p-2 bg-background" />
    </div>
  );
}

export function ProcessViewerWindow() {
  const loadTheme = useThemeStore((state) => state.loadTheme);
  const [selectedProcessId, setSelectedProcessId] = useState<string | null>(null);
  
  // Local state for processes in this window (synced via events from main window)
  const [localProcesses, setLocalProcesses] = useState<Record<string, RunningProcess>>({});
  const [localLogs, setLocalLogs] = useState<Record<string, { type: string; content: string }[]>>({});

  const processList = Object.values(localProcesses);
  const selectedProcess = selectedProcessId ? localProcesses[selectedProcessId] : null;

  useEffect(() => {
    loadTheme();
  }, [loadTheme]);

  // Request current process list from main window on mount
  useEffect(() => {
    const unlistenSyncPromise = listen<ProcessListSyncPayload>("process-list-sync", (event) => {
      console.log('[ProcessViewer] received process-list-sync:', event.payload.processes.length, 'processes');
      const { processes, logs } = event.payload;
      const processMap: Record<string, RunningProcess> = {};
      for (const p of processes) {
        processMap[p.processId] = {
          ...p,
          type: p.type as RunningProcess["type"],
          startedAt: new Date(p.startedAt),
        };
      }
      setLocalProcesses(processMap);
      setLocalLogs(logs);
    });

    // Request the current process list (emitted globally, main window will respond)
    console.log('[ProcessViewer] emitting request-process-list');
    emit("request-process-list", {}).catch((err) => {
      console.error('[ProcessViewer] Failed to emit request-process-list:', err);
    });

    return () => {
      unlistenSyncPromise.then((unlisten) => unlisten());
    };
  }, []);

  // Listen for process registration/unregistration events from main window
  useEffect(() => {
    const unlistenRegisterPromise = listen<ProcessRegisteredPayload>("process-registered", (event) => {
      console.log('[ProcessViewer] received process-registered:', event.payload.process.label, event.payload.process.processId);
      const { process } = event.payload;
      const runningProcess: RunningProcess = {
        ...process,
        type: process.type as RunningProcess["type"],
        startedAt: new Date(process.startedAt),
      };
      setLocalProcesses((prev) => ({
        ...prev,
        [process.processId]: runningProcess,
      }));
      // Initialize logs for this process
      setLocalLogs((prev) => ({
        ...prev,
        [process.processId]: [],
      }));
    });

    const unlistenUnregisterPromise = listen<ProcessUnregisteredPayload>("process-unregistered", (event) => {
      const { processId } = event.payload;
      setLocalProcesses((prev) => {
        const { [processId]: _, ...rest } = prev;
        return rest;
      });
      if (selectedProcessId === processId) {
        setSelectedProcessId(null);
      }
    });

    return () => {
      unlistenRegisterPromise.then((unlisten) => unlisten());
      unlistenUnregisterPromise.then((unlisten) => unlisten());
    };
  }, [selectedProcessId]);

  // Listen for agent output and exit events
  useEffect(() => {
    const unlistenOutputPromise = listen<AgentOutputPayload>("agent-output", (event) => {
      const { processId, streamType, content } = event.payload;
      setLocalLogs((prev) => ({
        ...prev,
        [processId]: [...(prev[processId] || []), { type: streamType, content }],
      }));
    });

    const unlistenExitPromise = listen<AgentExitPayload>("agent-exit", (event) => {
      const { processId } = event.payload;
      // The process-unregistered event handles removal, but we can handle exit here too
      setLocalProcesses((prev) => {
        const { [processId]: _, ...rest } = prev;
        return rest;
      });
      if (selectedProcessId === processId) {
        setSelectedProcessId(null);
      }
    });

    return () => {
      unlistenOutputPromise.then((unlisten) => unlisten());
      unlistenExitPromise.then((unlisten) => unlisten());
    };
  }, [selectedProcessId]);

  // Auto-select first process if none selected
  useEffect(() => {
    if (!selectedProcessId && processList.length > 0) {
      setSelectedProcessId(processList[0].processId);
    }
  }, [processList, selectedProcessId]);

  return (
    <div className="flex h-screen bg-background text-foreground">
      {/* Process list sidebar */}
      <div className="w-64 flex-shrink-0 border-r border-border flex flex-col">
        <div className="p-3 border-b border-border">
          <h1 className="text-sm font-semibold text-foreground">Running Processes</h1>
          <p className="text-xs text-muted mt-0.5">{processList.length} active</p>
        </div>
        <div className="flex-1 overflow-y-auto">
          {processList.length === 0 ? (
            <div className="p-4 text-center text-muted text-sm">
              No running processes
            </div>
          ) : (
            processList.map((proc) => (
              <ProcessRow
                key={proc.processId}
                process={proc}
                isSelected={selectedProcessId === proc.processId}
                onSelect={() => setSelectedProcessId(proc.processId)}
              />
            ))
          )}
        </div>
      </div>

      {/* Process detail panel */}
      <div className="flex-1 min-w-0">
        {selectedProcess ? (
          <ProcessDetail
            key={selectedProcess.processId}
            process={selectedProcess}
            logs={localLogs[selectedProcess.processId] || []}
            onStop={() => setSelectedProcessId(null)}
          />
        ) : (
          <div className="flex items-center justify-center h-full text-muted">
            <div className="text-center">
              <svg className="w-12 h-12 mx-auto mb-2 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <p className="text-sm">Select a process to view details</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
