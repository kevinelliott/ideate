import { useEffect, useRef, useState, useCallback } from "react";
import { defaultPlugins, type AgentPlugin } from "../types";
import { useAgentSession } from "../hooks/useAgentSession";
import { useAgentStore } from "../stores/agentStore";
import { usePanelStore } from "../stores/panelStore";
import { StreamLogEntry } from "./StreamLogEntry";

interface AgentPanelProps {
  projectId: string;
  projectPath: string;
}

interface LogEntry {
  content: string;
  timestamp: Date;
  type: "stdout" | "stderr" | "system";
}

const MIN_HEIGHT = 100;
const MAX_HEIGHT = 500;
const COLLAPSED_HEIGHT = 36;

const GREETING_MESSAGE = "Hello, I'm a sidekick agent separate from your main build agent. I can help you inspect your project, answer questions, or perform research.";

export function AgentPanel({ projectId, projectPath }: AgentPanelProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  
  const panelState = usePanelStore((state) => state.getPanelState(projectId));
  const setAgentPanelCollapsed = usePanelStore((state) => state.setAgentPanelCollapsed);
  const setAgentPanelHeight = usePanelStore((state) => state.setAgentPanelHeight);
  
  const isCollapsed = panelState.agentPanelCollapsed;
  const height = panelState.agentPanelHeight;
  
  const setIsCollapsed = useCallback((collapsed: boolean) => {
    setAgentPanelCollapsed(projectId, collapsed);
  }, [projectId, setAgentPanelCollapsed]);
  
  const setHeight = useCallback((newHeight: number) => {
    setAgentPanelHeight(projectId, newHeight);
  }, [projectId, setAgentPanelHeight]);
  
  const [isResizing, setIsResizing] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const [isThinking, setIsThinking] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [autoScroll, setAutoScroll] = useState(true);
  const startYRef = useRef(0);
  const startHeightRef = useRef(0);
  const lastProjectIdRef = useRef<string | null>(null);
  const hasAutoStartedRef = useRef<Set<string>>(new Set());

  const getSession = useAgentStore((state) => state.getSession);
  const addMessage = useAgentStore((state) => state.addMessage);
  const clearMessages = useAgentStore((state) => state.clearMessages);
  const session = getSession(projectId);

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

  // Live output handler - adds to logs
  const handleOutput = useCallback((content: string, streamType: 'stdout' | 'stderr') => {
    setIsThinking(false);
    setLogs(prev => [...prev, {
      content,
      timestamp: new Date(),
      type: streamType
    }]);
  }, []);

  // Exit handler
  const handleExit = useCallback((success: boolean, exitCode: number | null) => {
    setIsThinking(false);
    if (!success) {
      setLogs(prev => [...prev, {
        content: `Agent failed (exit code: ${exitCode ?? 'unknown'})`,
        timestamp: new Date(),
        type: 'stderr'
      }]);
    }
    inputRef.current?.focus();
  }, []);

  const { session: agentSession, sendMessage, cancelSession, changeAgent } = useAgentSession(
    projectId,
    projectPath,
    handleOutput,
    handleExit
  );

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
  }, [isResizing, setHeight]);

  // Auto-start agent with greeting when project is selected and no messages exist
  useEffect(() => {
    const currentSession = useAgentStore.getState().getSession(projectId);
    
    if (
      currentSession.messages.length === 0 && 
      !currentSession.isRunning &&
      !hasAutoStartedRef.current.has(projectId)
    ) {
      hasAutoStartedRef.current.add(projectId);
      
      addMessage(projectId, { role: 'system', content: GREETING_MESSAGE });
      setLogs([{
        content: GREETING_MESSAGE,
        timestamp: new Date(),
        type: 'system'
      }]);
    }
  }, [projectId, addMessage]);

  // Handle project change - restore logs from messages
  useEffect(() => {
    if (lastProjectIdRef.current !== projectId) {
      const currentSession = useAgentStore.getState().getSession(projectId);
      
      // Convert messages to log entries
      const restoredLogs: LogEntry[] = [];
      for (const msg of currentSession.messages) {
        if (msg.role === 'user') {
          restoredLogs.push({
            content: `❯ ${msg.content}`,
            timestamp: msg.timestamp,
            type: 'system'
          });
        } else if (msg.role === 'agent' && msg.content.trim()) {
          // Agent messages may contain multiple lines (JSON entries)
          const lines = msg.content.split('\n').filter(line => line.trim());
          for (const line of lines) {
            restoredLogs.push({
              content: line,
              timestamp: msg.timestamp,
              type: 'stdout'
            });
          }
        } else if (msg.role === 'system') {
          restoredLogs.push({
            content: msg.content,
            timestamp: msg.timestamp,
            type: 'system'
          });
        }
      }
      
      setLogs(restoredLogs);
      setInputValue("");
      lastProjectIdRef.current = projectId;
    }
  }, [projectId]);

  const toggleCollapse = () => {
    setIsCollapsed(!isCollapsed);
  };

  const handleClearHistory = () => {
    if (agentSession.isRunning) return;
    
    clearMessages(projectId);
    setLogs([{
      content: GREETING_MESSAGE,
      timestamp: new Date(),
      type: 'system'
    }]);
    
    addMessage(projectId, { role: 'system', content: GREETING_MESSAGE });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim() || agentSession.isRunning) return;

    const message = inputValue.trim();
    setInputValue("");

    // Add user message to logs
    setLogs(prev => [...prev, {
      content: `❯ ${message}`,
      timestamp: new Date(),
      type: 'system'
    }]);

    // Start thinking indicator
    setIsThinking(true);

    await sendMessage(message);
  };

  const handleCancel = async () => {
    setIsThinking(false);
    await cancelSession();
    setLogs(prev => [...prev, {
      content: '⚠ Agent cancelled',
      timestamp: new Date(),
      type: 'stderr'
    }]);
  };

  const panelHeight = isCollapsed ? COLLAPSED_HEIGHT : height + COLLAPSED_HEIGHT;

  return (
    <div 
      ref={containerRef} 
      className="bg-background overflow-hidden flex flex-col border-t border-border"
      style={{ height: panelHeight }}
    >
      {/* Resize handle */}
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
          <span className="text-xs font-medium text-muted uppercase tracking-wider">Sidekick Agent</span>
          {(agentSession.isRunning || isThinking) && (
            <span className="w-2 h-2 rounded-full bg-accent animate-pulse" />
          )}
        </button>
        
        <div className="flex items-center gap-2">
          <button
            onClick={handleClearHistory}
            disabled={agentSession.isRunning}
            className={`p-1 rounded transition-colors flex items-center justify-center ${
              agentSession.isRunning 
                ? 'text-muted/50 cursor-not-allowed' 
                : 'text-muted hover:text-foreground hover:bg-card'
            }`}
            title="Clear history"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
          
          <select
            value={session.agentId}
            onChange={(e) => changeAgent(e.target.value)}
            disabled={agentSession.isRunning}
            className={`bg-transparent text-xs text-secondary border-none outline-none pr-4 appearance-none h-5 leading-none ${
              agentSession.isRunning ? 'opacity-50 cursor-not-allowed' : 'hover:text-foreground cursor-pointer'
            }`}
            style={{
              backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23717179' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`,
              backgroundRepeat: 'no-repeat',
              backgroundPosition: 'right center',
              paddingRight: '16px'
            }}
          >
            {defaultPlugins.map((plugin: AgentPlugin) => (
              <option key={plugin.id} value={plugin.id}>
                {plugin.name}
              </option>
            ))}
          </select>
        </div>
      </div>
      
      {/* Agent content */}
      {!isCollapsed && (
        <>
          <div 
            ref={scrollRef}
            onScroll={handleScroll}
            className="relative flex-1 overflow-y-auto px-3 py-2 font-mono text-xs space-y-1"
          >
            {logs.length === 0 && (
              <div className="absolute inset-0 flex items-center justify-center text-muted z-10 pointer-events-none text-sm">
                Waiting for input...
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
            {isThinking && (
              <div className="flex items-center gap-2 py-2 text-muted">
                <div className="flex gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-accent animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="w-1.5 h-1.5 rounded-full bg-accent animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="w-1.5 h-1.5 rounded-full bg-accent animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
                <span className="text-xs">Thinking...</span>
              </div>
            )}
          </div>
          
          {/* Input area */}
          <form onSubmit={handleSubmit} className="flex-shrink-0 border-t border-border">
            <div className="flex items-center gap-2 px-3 py-2">
              <span className="text-accent text-sm">❯</span>
              <input
                ref={inputRef}
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                placeholder={agentSession.isRunning ? "Agent is running..." : "Type a message..."}
                disabled={agentSession.isRunning}
                className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted border-none outline-none"
              />
              {agentSession.isRunning ? (
                <button
                  type="button"
                  onClick={handleCancel}
                  className="p-1 rounded text-destructive hover:bg-destructive/10 transition-colors"
                  title="Cancel"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={!inputValue.trim()}
                  className={`p-1 rounded transition-colors flex items-center justify-center ${
                    inputValue.trim()
                      ? 'text-accent hover:bg-accent/10'
                      : 'text-muted cursor-not-allowed'
                  }`}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                  </svg>
                </button>
              )}
            </div>
          </form>
        </>
      )}
    </div>
  );
}
