import { useEffect, useRef, useState, useCallback } from "react";
import { useBuildStore } from "../stores/buildStore";
import { usePanelStore } from "../stores/panelStore";
import { useTheme } from "../hooks/useTheme";
import { getTerminalTheme } from "../utils/terminalThemes";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";

interface LogPanelProps {
  projectId: string;
}

const MIN_HEIGHT = 80;
const MAX_HEIGHT = 400;
const COLLAPSED_HEIGHT = 36;


export function LogPanel({ projectId }: LogPanelProps) {
  const getProjectState = useBuildStore((state) => state.getProjectState);
  const projectState = getProjectState(projectId);
  const logs = projectState.logs;
  const status = projectState.status;

  const { resolvedTheme } = useTheme();

  const panelState = usePanelStore((state) => state.getPanelState(projectId));
  const setLogPanelCollapsed = usePanelStore((state) => state.setLogPanelCollapsed);
  const setLogPanelHeight = usePanelStore((state) => state.setLogPanelHeight);

  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const lastLogCountRef = useRef(0);
  const lastProjectIdRef = useRef<string | null>(null);

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

  // Update terminal theme when resolved theme changes
  useEffect(() => {
    if (xtermRef.current) {
      const theme = getTerminalTheme(resolvedTheme);
      xtermRef.current.options.theme = theme;
      // Force a full refresh of all visible rows to apply new colors
      const rows = xtermRef.current.rows;
      xtermRef.current.refresh(0, rows - 1);
      if (fitAddonRef.current) {
        fitAddonRef.current.fit();
      }
    }
  }, [resolvedTheme]);

  // Initialize terminal - depends on resolvedTheme to recreate when theme changes
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

    // Restore logs after terminal is created
    lastLogCountRef.current = 0;
    for (const log of logs) {
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
        
        for (const log of logs) {
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
          xtermRef.current.writeln(`${prefix}${log.content}${suffix}`);
        }
        
        lastLogCountRef.current = logs.length;
        if (autoScroll) {
          xtermRef.current.scrollToBottom();
        }
      }
      lastProjectIdRef.current = projectId;
    }
  }, [projectId, logs, autoScroll, isCollapsed]);

  useEffect(() => {
    if (isCollapsed) return;
    if (!xtermRef.current || lastProjectIdRef.current !== projectId) return;

    const newLogs = logs.slice(lastLogCountRef.current);
    lastLogCountRef.current = logs.length;

    for (const log of newLogs) {
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
      xtermRef.current.writeln(`${prefix}${log.content}${suffix}`);
    }

    if (autoScroll) {
      xtermRef.current.scrollToBottom();
    }
  }, [logs, autoScroll, projectId, isCollapsed]);

  const isEmpty = logs.length === 0;

  const handleScrollToBottom = () => {
    setAutoScroll(true);
    xtermRef.current?.scrollToBottom();
  };

  const toggleCollapse = () => {
    setIsCollapsed(!isCollapsed);
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
            <span className="text-xs text-muted">({logs.length})</span>
          )}
        </button>
        {!isCollapsed && !isEmpty && !autoScroll && (
          <button
            onClick={handleScrollToBottom}
            className="text-xs text-accent hover:text-accent/80 transition-colors"
          >
            Scroll to bottom
          </button>
        )}
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
