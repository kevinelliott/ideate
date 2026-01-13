import { useEffect, useRef, useState, useCallback } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { defaultPlugins, type AgentPlugin } from "../types";
import { useAgentSession } from "../hooks/useAgentSession";
import { useAgentStore } from "../stores/agentStore";
import { useTheme } from "../hooks/useTheme";
import { getTerminalTheme } from "../utils/terminalThemes";
import { formatAgentOutput, wordWrap } from "../utils/markdownToAnsi";
import "@xterm/xterm/css/xterm.css";

interface AgentPanelProps {
  projectId: string;
  projectPath: string;
}

const MIN_HEIGHT = 100;
const MAX_HEIGHT = 500;
const DEFAULT_HEIGHT = 200;
const COLLAPSED_HEIGHT = 36;

const GREETING_MESSAGE = "Hello, I'm a sidekick agent separate from your main build agent. I can help you inspect your project, answer questions, or perform research.";

export function AgentPanel({ projectId, projectPath }: AgentPanelProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalWrapperRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const xtermRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  
  const [height, setHeight] = useState(DEFAULT_HEIGHT);
  const [isCollapsed, setIsCollapsed] = useState(true);
  const [isResizing, setIsResizing] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const [isThinking, setIsThinking] = useState(false);
  const [hasReceivedOutput, setHasReceivedOutput] = useState(false);
  const startYRef = useRef(0);
  const startHeightRef = useRef(0);
  const lastProjectIdRef = useRef<string | null>(null);
  const hasAutoStartedRef = useRef<Set<string>>(new Set());
  const thinkingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const thinkingLineRef = useRef<number | null>(null);
  const lastTerminalColsRef = useRef<number>(80);

  const { resolvedTheme } = useTheme();

  const getSession = useAgentStore((state) => state.getSession);
  const addMessage = useAgentStore((state) => state.addMessage);
  const clearMessages = useAgentStore((state) => state.clearMessages);
  const session = getSession(projectId);

  // Helper to get terminal width
  const getTerminalCols = useCallback(() => {
    return xtermRef.current?.cols ?? 80;
  }, []);

  // Helper to write text with word wrapping
  const writeWrapped = useCallback((terminal: Terminal, text: string, style?: string) => {
    const cols = terminal.cols;
    const lines = wordWrap(text, cols);
    for (const line of lines) {
      if (style) {
        terminal.writeln(`${style}${line}\x1b[0m`);
      } else {
        terminal.writeln(line);
      }
    }
  }, []);

  // Clear thinking indicator
  const clearThinkingIndicator = useCallback(() => {
    if (thinkingIntervalRef.current) {
      clearInterval(thinkingIntervalRef.current);
      thinkingIntervalRef.current = null;
    }
    // Clear the thinking line if we wrote one
    if (xtermRef.current && thinkingLineRef.current !== null) {
      // Move up one line, clear it, then move back
      xtermRef.current.write('\x1b[1A\x1b[2K');
      thinkingLineRef.current = null;
    }
    setIsThinking(false);
  }, []);

  // Start thinking indicator
  const startThinkingIndicator = useCallback(() => {
    setIsThinking(true);
    setHasReceivedOutput(false);
    
    if (!xtermRef.current) return;
    
    const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
    let frameIndex = 0;
    
    // Write initial thinking line
    xtermRef.current.writeln(`\x1b[90m${frames[0]} Thinking...\x1b[0m`);
    thinkingLineRef.current = 1;
    
    thinkingIntervalRef.current = setInterval(() => {
      if (xtermRef.current && thinkingLineRef.current !== null) {
        frameIndex = (frameIndex + 1) % frames.length;
        // Move up, clear line, write new frame, move down
        xtermRef.current.write(`\x1b[1A\x1b[2K\x1b[90m${frames[frameIndex]} Thinking...\x1b[0m\n`);
      }
    }, 80);
  }, []);

  // Live output handler - writes to terminal as agent runs with markdown formatting
  const handleOutput = useCallback((content: string, streamType: 'stdout' | 'stderr') => {
    // Clear thinking indicator on first output
    if (!hasReceivedOutput) {
      clearThinkingIndicator();
      setHasReceivedOutput(true);
    }
    
    if (xtermRef.current) {
      const cols = getTerminalCols();
      if (streamType === 'stderr') {
        // Word wrap stderr
        const lines = wordWrap(content, cols);
        for (const line of lines) {
          xtermRef.current.writeln(`\x1b[31m${line}\x1b[0m`);
        }
      } else {
        // Apply markdown formatting and word wrap to stdout
        const formatted = formatAgentOutput(content, cols);
        // formatAgentOutput now returns newline-joined string when given width
        xtermRef.current.writeln(formatted);
      }
    }
  }, [hasReceivedOutput, clearThinkingIndicator, getTerminalCols]);

  // Exit handler - only show message on error
  const handleExit = useCallback((success: boolean, exitCode: number | null) => {
    clearThinkingIndicator();
    
    if (xtermRef.current) {
      if (!success) {
        xtermRef.current.writeln(`\x1b[31m✗ Agent failed (exit code: ${exitCode ?? 'unknown'})\x1b[0m`);
      }
      xtermRef.current.writeln('');
    }
    inputRef.current?.focus();
  }, [clearThinkingIndicator]);

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
  }, [isResizing]);

  // Helper to restore messages to terminal with markdown formatting and word wrap
  const restoreMessagesToTerminal = useCallback((terminal: Terminal, messages: typeof session.messages) => {
    const cols = terminal.cols;
    
    for (const msg of messages) {
      if (msg.role === 'user') {
        // User messages: wrap the content after the prompt
        const userLines = wordWrap(msg.content, cols - 2); // Account for "❯ " prefix
        userLines.forEach((line, i) => {
          if (i === 0) {
            terminal.writeln(`\x1b[32m❯\x1b[0m ${line}`);
          } else {
            terminal.writeln(`  ${line}`);
          }
        });
      } else if (msg.role === 'agent' && msg.content.trim()) {
        // Agent content may have multiple lines, format each line with word wrap
        const contentLines = msg.content.split('\n');
        for (const line of contentLines) {
          if (line) {
            const formatted = formatAgentOutput(line, cols);
            terminal.writeln(formatted);
          }
        }
      } else if (msg.role === 'system') {
        writeWrapped(terminal, msg.content, '\x1b[90m');
      }
    }
    
    // Scroll to bottom after restoring
    terminal.scrollToBottom();
  }, [writeWrapped]);

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
      
      if (xtermRef.current) {
        writeWrapped(xtermRef.current, GREETING_MESSAGE, '\x1b[90m');
      }
    }
  }, [projectId, addMessage, writeWrapped]);

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

  // Initialize terminal - recreate when theme changes to ensure proper theming
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
      lastTerminalColsRef.current = terminal.cols;
    });

    xtermRef.current = terminal;
    fitAddonRef.current = fitAddon;

    const currentSession = useAgentStore.getState().getSession(projectId);
    restoreMessagesToTerminal(terminal, currentSession.messages);
    lastProjectIdRef.current = projectId;

    // Debounce timer for re-rendering on resize
    let resizeDebounceTimer: ReturnType<typeof setTimeout> | null = null;

    const resizeObserver = new ResizeObserver(() => {
      requestAnimationFrame(() => {
        if (!fitAddonRef.current || !xtermRef.current) return;
        
        fitAddonRef.current.fit();
        
        const newCols = xtermRef.current.cols;
        const oldCols = lastTerminalColsRef.current;
        
        // Only re-render if column count changed significantly
        if (newCols !== oldCols) {
          lastTerminalColsRef.current = newCols;
          
          // Debounce the re-render to avoid excessive updates during resize
          if (resizeDebounceTimer) {
            clearTimeout(resizeDebounceTimer);
          }
          
          resizeDebounceTimer = setTimeout(() => {
            if (xtermRef.current && !agentSession.isRunning) {
              xtermRef.current.clear();
              const session = useAgentStore.getState().getSession(projectId);
              restoreMessagesToTerminal(xtermRef.current, session.messages);
            }
          }, 150);
        }
      });
    });
    
    // Observe the wrapper div that has the padding applied
    if (terminalWrapperRef.current) {
      resizeObserver.observe(terminalWrapperRef.current);
    }

    return () => {
      if (resizeDebounceTimer) {
        clearTimeout(resizeDebounceTimer);
      }
      resizeObserver.disconnect();
      terminal.dispose();
      xtermRef.current = null;
      fitAddonRef.current = null;
      if (thinkingIntervalRef.current) {
        clearInterval(thinkingIntervalRef.current);
      }
    };
  }, [isCollapsed, projectId, restoreMessagesToTerminal, agentSession.isRunning, resolvedTheme]);

  // Handle project change
  useEffect(() => {
    if (lastProjectIdRef.current !== projectId && xtermRef.current) {
      clearThinkingIndicator();
      xtermRef.current.clear();
      const currentSession = useAgentStore.getState().getSession(projectId);
      restoreMessagesToTerminal(xtermRef.current, currentSession.messages);
      setInputValue("");
      lastProjectIdRef.current = projectId;
    }
  }, [projectId, restoreMessagesToTerminal, clearThinkingIndicator]);

  useEffect(() => {
    if (!isCollapsed && fitAddonRef.current) {
      requestAnimationFrame(() => {
        fitAddonRef.current?.fit();
      });
    }
  }, [height, isCollapsed]);

  const toggleCollapse = () => {
    setIsCollapsed(!isCollapsed);
  };

  const handleClearHistory = () => {
    if (agentSession.isRunning) return;
    
    clearMessages(projectId);
    
    if (xtermRef.current) {
      xtermRef.current.clear();
      writeWrapped(xtermRef.current, GREETING_MESSAGE, '\x1b[90m');
    }
    
    addMessage(projectId, { role: 'system', content: GREETING_MESSAGE });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim() || agentSession.isRunning) return;

    const message = inputValue.trim();
    setInputValue("");

    if (xtermRef.current) {
      // Word wrap user input
      const cols = getTerminalCols();
      const userLines = wordWrap(message, cols - 2);
      userLines.forEach((line, i) => {
        if (i === 0) {
          xtermRef.current!.writeln(`\x1b[32m❯\x1b[0m ${line}`);
        } else {
          xtermRef.current!.writeln(`  ${line}`);
        }
      });
    }

    // Start thinking indicator before sending
    startThinkingIndicator();

    await sendMessage(message);
  };

  const handleCancel = async () => {
    clearThinkingIndicator();
    await cancelSession();
    if (xtermRef.current) {
      xtermRef.current.writeln('\x1b[33m⚠ Agent cancelled\x1b[0m');
      xtermRef.current.writeln('');
    }
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
          <div className="relative flex-1 overflow-hidden">
            {/* Wrapper with padding - xterm will fit inside this */}
            <div 
              ref={terminalWrapperRef}
              className="absolute inset-0 py-2 px-3"
            >
              <div
                ref={terminalRef}
                className="h-full w-full overflow-hidden"
              />
            </div>
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
