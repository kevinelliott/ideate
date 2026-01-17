import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { useBuildStore } from "../stores/buildStore";
import { usePanelStore } from "../stores/panelStore";
import { useProjectStore } from "../stores/projectStore";
import { StreamLogEntry } from "./StreamLogEntry";
import { save } from "@tauri-apps/plugin-dialog";
import { documentDir } from "@tauri-apps/api/path";
import { invoke } from "@tauri-apps/api/core";

interface LogPanelProps {
  projectId: string;
}

const MIN_HEIGHT = 80;
const MAX_HEIGHT = 400;
const COLLAPSED_HEIGHT = 36;

export function LogPanel({ projectId }: LogPanelProps) {
  const projectState = useBuildStore((state) => state.projectStates[projectId]);
  const logs = projectState?.logs ?? [];
  const status = projectState?.status ?? 'idle';

  const projects = useProjectStore((state) => state.projects);
  const project = projects.find((p) => p.id === projectId);

  const panelState = usePanelStore((state) => state.getPanelState(projectId));
  const setLogPanelCollapsed = usePanelStore((state) => state.setLogPanelCollapsed);
  const setLogPanelHeight = usePanelStore((state) => state.setLogPanelHeight);

  const containerRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const [filterText, setFilterText] = useState("");

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

  const isEmpty = logs.length === 0;

  const handleScrollToBottom = () => {
    setAutoScroll(true);
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
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
        <div 
          ref={scrollRef}
          onScroll={handleScroll}
          className="relative flex-1 overflow-y-auto px-3 py-2 font-mono text-xs space-y-1"
        >
          {isEmpty && (
            <div className="absolute inset-0 flex items-center justify-center text-muted z-10 pointer-events-none text-sm">
              {status === "idle"
                ? "Waiting for build to start..."
                : "No output yet..."}
            </div>
          )}
          {filteredLogs.map((log, index) => (
            <StreamLogEntry
              key={index}
              content={log.content}
              timestamp={log.timestamp}
              type={log.type}
            />
          ))}
        </div>
      )}
    </div>
  );
}
