import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { useBuildStore, type LogEntry } from "../stores/buildStore";
import { usePanelStore } from "../stores/panelStore";
import { useProjectStore } from "../stores/projectStore";
import { useTheme } from "../hooks/useTheme";
import { getTerminalTheme } from "../utils/terminalThemes";
import { formatStreamJson } from "../utils/streamJsonFormatter";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { save } from "@tauri-apps/plugin-dialog";
import { documentDir } from "@tauri-apps/api/path";
import { invoke } from "@tauri-apps/api/core";
import "@xterm/xterm/css/xterm.css";

interface LogPanelProps {
  projectId: string;
}

const MIN_HEIGHT = 80;
const MAX_HEIGHT = 400;
const COLLAPSED_HEIGHT = 36;

function formatLogLine(log: LogEntry, filterText?: string): string {
  let prefix = "";
  const timestamp = log.timestamp.toLocaleTimeString();
  
  // Try to format streaming JSON content
  let content = log.content;
  if (log.type === "stdout" || log.type === "stderr") {
    const formatted = formatStreamJson(content);
    if (formatted) {
      content = formatted;
    }
  }

  if (filterText && filterText.length > 0) {
    const escapedFilter = filterText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(${escapedFilter})`, 'gi');
    content = content.replace(regex, '\x1b[43m\x1b[30m$1\x1b[0m');
  }

  switch (log.type) {
    case "stdout":
      prefix = `\x1b[90m[${timestamp}]\x1b[0m `;
      return `${prefix}${content}`;
    case "stderr":
      prefix = `\x1b[90m[${timestamp}]\x1b[0m \x1b[31m`;
      return `${prefix}${content}\x1b[0m`;
    case "system":
      prefix = `\x1b[90m[${timestamp}]\x1b[0m \x1b[32m`;
      return `${prefix}${content}\x1b[0m`;
    default:
      return `${prefix}${content}`;
  }
}


export function LogPanel({ projectId }: LogPanelProps) {
  const projectState = useBuildStore((state) => state.projectStates[projectId]);
  const logs = projectState?.logs ?? [];
  const status = projectState?.status ?? 'idle';

  const { resolvedTheme } = useTheme();

  const projects = useProjectStore((state) => state.projects);
  const project = projects.find((p) => p.id === projectId);

  const panelState = usePanelStore((state) => state.getPanelState(projectId));
  const setLogPanelCollapsed = usePanelStore((state) => state.setLogPanelCollapsed);
  const setLogPanelHeight = usePanelStore((state) => state.setLogPanelHeight);

  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const [filterText, setFilterText] = useState("");
  const lastLogCountRef = useRef(0);
  const lastProjectIdRef = useRef<string | null>(null);
  const lastFilterRef = useRef("");

  const filteredLogs = useMemo(() => {
    if (!filterText.trim()) return logs;
    const lowerFilter = filterText.toLowerCase();
    return logs.filter(log => log.content.toLowerCase().includes(lowerFilter));
  }, [logs, filterText]);

  const height = panelState.logPanelHeight;
  const isCollapsed = panelState.logPanelCollapsed;
  const setHeight = (h: number) => setLogPanelHeight(projectId, h);
  const setIsCollapsed = (c: boolean) => setLogPanelCollapsed(projectId, c);

  const [isResizing, setIsResizing] = useState(false);
  const startYRef = useRef(0);
  const startHeightRef = useRef(0);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (isCollapsed) return;
    e.preventDefault();
    setIsResizing(true);
    startYRef.current = e.clientY;
    startHeightRef.current = height;
  }, [height, isCollapsed]);

  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      const deltaY = startYRef.current - e.clientY;
      const newHeight = Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, startHeightRef.current + deltaY));
      setHeight(newHeight);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isResizing]);

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

  useEffect(() => {
    if (isCollapsed || !terminalRef.current) return;

    const terminal = new Terminal({
      theme: getTerminalTheme(resolvedTheme),
      fontSize: 12,
      fontFamily: '"SF Mono", "JetBrains Mono", "Monaco", "Menlo", monospace',
      cursorBlink: false,
      disableStdin: true,
      convertEol: true,
      scrollback: 5000,
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

    lastLogCountRef.current = 0;
    lastFilterRef.current = filterText;
    for (const log of filteredLogs) {
      terminal.writeln(formatLogLine(log, filterText));
    }
    lastLogCountRef.current = logs.length;
    if (autoScroll) {
      terminal.scrollToBottom();
    }
    lastProjectIdRef.current = projectId;

    return () => {
      resizeObserver.disconnect();
      terminal.dispose();
      xtermRef.current = null;
      fitAddonRef.current = null;
    };
  }, [isCollapsed, resolvedTheme]);

  useEffect(() => {
    if (!isCollapsed && fitAddonRef.current) {
      requestAnimationFrame(() => {
        fitAddonRef.current?.fit();
      });
    }
  }, [height, isCollapsed]);

  useEffect(() => {
    if (isCollapsed) return;
    
    if (lastProjectIdRef.current !== projectId) {
      if (xtermRef.current) {
        xtermRef.current.clear();
        lastLogCountRef.current = 0;
        lastFilterRef.current = filterText;
        
        for (const log of filteredLogs) {
          xtermRef.current.writeln(formatLogLine(log, filterText));
        }
        
        lastLogCountRef.current = logs.length;
        if (autoScroll) {
          xtermRef.current.scrollToBottom();
        }
      }
      lastProjectIdRef.current = projectId;
    }
  }, [projectId, logs, filteredLogs, filterText, autoScroll, isCollapsed]);

  useEffect(() => {
    if (isCollapsed) return;
    if (!xtermRef.current || lastProjectIdRef.current !== projectId) return;

    if (lastFilterRef.current !== filterText) {
      xtermRef.current.clear();
      lastFilterRef.current = filterText;
      for (const log of filteredLogs) {
        xtermRef.current.writeln(formatLogLine(log, filterText));
      }
      lastLogCountRef.current = logs.length;
      if (autoScroll) {
        xtermRef.current.scrollToBottom();
      }
      return;
    }

    const newLogs = logs.slice(lastLogCountRef.current);
    lastLogCountRef.current = logs.length;

    const lowerFilter = filterText.toLowerCase();
    for (const log of newLogs) {
      if (!filterText.trim() || log.content.toLowerCase().includes(lowerFilter)) {
        xtermRef.current.writeln(formatLogLine(log, filterText));
      }
    }

    if (autoScroll) {
      xtermRef.current.scrollToBottom();
    }
  }, [logs, filteredLogs, filterText, autoScroll, projectId, isCollapsed]);

  const isEmpty = logs.length === 0;

  const handleScrollToBottom = () => {
    setAutoScroll(true);
    xtermRef.current?.scrollToBottom();
  };

  const toggleCollapse = () => {
    setIsCollapsed(!isCollapsed);
  };

  const handleExportLogs = async () => {
    if (logs.length === 0) return;

    try {
      const defaultPath = await documentDir();
      const projectName = project?.name ?? "project";
      const sanitizedName = projectName.replace(/[^a-zA-Z0-9\s-]/g, "").replace(/\s+/g, "-").toLowerCase();
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
      const fileName = `${sanitizedName}-logs-${timestamp}.txt`;

      const filePath = await save({
        defaultPath: `${defaultPath}/${fileName}`,
        filters: [{ name: "Text Files", extensions: ["txt"] }],
        title: "Export Build Logs",
      });

      if (filePath) {
        const formattedLogs = logs.map((log) => {
          const ts = log.timestamp.toLocaleString();
          const typePrefix = log.type === "stderr" ? "[ERROR]" : log.type === "system" ? "[SYSTEM]" : "[OUT]";
          return `[${ts}] ${typePrefix} ${log.content}`;
        }).join("\n");

        const header = `Build Logs - ${project?.name ?? "Unknown Project"}\nExported: ${new Date().toLocaleString()}\n${"=".repeat(60)}\n\n`;
        const content = header + formattedLogs;

        const encoder = new TextEncoder();
        const data = Array.from(encoder.encode(content));
        await invoke("write_binary_file", { path: filePath, data });
      }
    } catch (error) {
      console.error("Failed to export logs:", error);
    }
  };

  const panelHeight = isCollapsed ? COLLAPSED_HEIGHT : height + COLLAPSED_HEIGHT;

  return (
    <div 
      ref={containerRef} 
      className="bg-background overflow-hidden flex flex-col border-t border-border"
      style={{ height: panelHeight }}
    >
      {/* Top resize handle - only show when expanded */}
      <div
        onMouseDown={handleMouseDown}
        className={`w-full flex-shrink-0 ${isCollapsed ? 'h-0' : 'h-1'} ${
          isCollapsed 
            ? 'cursor-default' 
            : 'cursor-ns-resize hover:bg-accent/30 active:bg-accent/50'
        } ${isResizing ? 'bg-accent/50' : ''}`}
      />
      
      {/* Header */}
      <div className={`flex items-center justify-between px-4 h-8 flex-shrink-0 ${isCollapsed ? "" : "border-b border-border"}`}>
        <button
          onClick={toggleCollapse}
          className="flex items-center gap-2 hover:text-foreground transition-colors"
        >
          <svg
            className={`w-3 h-3 text-muted transition-transform ${isCollapsed ? '' : 'rotate-180'}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
          </svg>
          <span className="text-xs font-medium text-muted uppercase tracking-wider">Log</span>
          {logs.length > 0 && (
            <span className="text-xs text-muted">
              {filterText.trim() ? `(${filteredLogs.length}/${logs.length})` : `(${logs.length})`}
            </span>
          )}
        </button>
        <div className="flex items-center gap-3">
          {!isCollapsed && logs.length > 0 && (
            <div className="flex items-center gap-1">
              <svg
                className="w-3 h-3 text-muted"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                value={filterText}
                onChange={(e) => setFilterText(e.target.value)}
                placeholder="Filter logs..."
                className="w-32 h-5 px-1.5 text-xs bg-muted/20 border border-border rounded focus:outline-none focus:border-accent placeholder:text-muted/50"
              />
              {filterText && (
                <button
                  onClick={() => setFilterText("")}
                  className="text-muted hover:text-foreground transition-colors"
                  title="Clear filter"
                >
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
          )}
          {!isCollapsed && !isEmpty && (
            <button
              onClick={handleExportLogs}
              className="text-muted hover:text-foreground transition-colors"
              title="Export logs"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
            </button>
          )}
          {!isCollapsed && !isEmpty && !autoScroll && (
            <button
              onClick={handleScrollToBottom}
              className="text-xs text-accent hover:text-accent/80 transition-colors"
            >
              Scroll to bottom
            </button>
          )}
        </div>
      </div>
      
      {/* Log content */}
      {!isCollapsed && (
        <div className="relative flex-1 overflow-hidden">
          {isEmpty && (
            <div className="absolute inset-0 flex items-center justify-center text-muted z-10 pointer-events-none text-sm">
              {status === "idle"
                ? "Waiting for build to start..."
                : "No output yet..."}
            </div>
          )}
          <div
            ref={terminalRef}
            className="h-full w-full overflow-hidden"
            style={{ padding: "8px 12px" }}
          />
        </div>
      )}
    </div>
  );
}
