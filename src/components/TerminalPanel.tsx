import { useEffect, useRef, useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { useTheme } from "../hooks/useTheme";
import { getTerminalTheme } from "../utils/terminalThemes";
import { useTerminalStore } from "../stores/terminalStore";
import { usePanelStore } from "../stores/panelStore";
import "@xterm/xterm/css/xterm.css";

interface TerminalPanelProps {
  projectId: string;
  projectPath: string;
}

interface SpawnTerminalResult {
  terminal_id: string;
}

interface TerminalOutputPayload {
  terminal_id: string;
  data: string;
}

interface TerminalExitPayload {
  terminal_id: string;
  exit_code: number | null;
}

const MIN_HEIGHT = 100;
const MAX_HEIGHT = 500;
const COLLAPSED_HEIGHT = 36;
export function TerminalPanel({ projectId, projectPath }: TerminalPanelProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalWrapperRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const unlistenOutputRef = useRef<UnlistenFn | null>(null);
  const unlistenExitRef = useRef<UnlistenFn | null>(null);
  const currentTerminalIdRef = useRef<string | null>(null);

  const panelState = usePanelStore((state) => state.getPanelState(projectId));
  const setTerminalPanelCollapsed = usePanelStore((state) => state.setTerminalPanelCollapsed);
  const setTerminalPanelHeight = usePanelStore((state) => state.setTerminalPanelHeight);

  const height = panelState.terminalPanelHeight;
  const isCollapsed = panelState.terminalPanelCollapsed;
  const setHeight = (h: number) => setTerminalPanelHeight(projectId, h);
  const setIsCollapsed = (c: boolean) => setTerminalPanelCollapsed(projectId, c);

  const [isResizing, setIsResizing] = useState(false);
  const [isSpawning, setIsSpawning] = useState(false);
  const startYRef = useRef(0);
  const startHeightRef = useRef(0);

  const { resolvedTheme } = useTheme();

  // Terminal store
  const registerTerminal = useTerminalStore((state) => state.registerTerminal);
  const unregisterTerminal = useTerminalStore((state) => state.unregisterTerminal);
  const getTerminalId = useTerminalStore((state) => state.getTerminalId);
  const hasTerminal = useTerminalStore((state) => state.hasTerminal);
  const markTerminalExited = useTerminalStore((state) => state.markTerminalExited);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (isCollapsed) return;
      e.preventDefault();
      setIsResizing(true);
      startYRef.current = e.clientY;
      startHeightRef.current = height;
    },
    [height, isCollapsed]
  );

  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      const deltaY = startYRef.current - e.clientY;
      const newHeight = Math.min(
        MAX_HEIGHT,
        Math.max(MIN_HEIGHT, startHeightRef.current + deltaY)
      );
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
      const rows = xtermRef.current.rows;
      xtermRef.current.refresh(0, rows - 1);
      if (fitAddonRef.current) {
        fitAddonRef.current.fit();
      }
    }
  }, [resolvedTheme]);

  // Set up global event listeners for terminal output/exit
  useEffect(() => {
    let mounted = true;

    const setupListeners = async () => {
      // Clean up old listeners
      unlistenOutputRef.current?.();
      unlistenExitRef.current?.();

      unlistenOutputRef.current = await listen<TerminalOutputPayload>(
        "terminal-output",
        (event) => {
          const { terminal_id, data } = event.payload;
          // Only write if this is our current terminal
          if (terminal_id === currentTerminalIdRef.current && xtermRef.current) {
            xtermRef.current.write(data);
          }
        }
      );

      unlistenExitRef.current = await listen<TerminalExitPayload>(
        "terminal-exit",
        (event) => {
          const { terminal_id, exit_code } = event.payload;
          if (terminal_id === currentTerminalIdRef.current && xtermRef.current) {
            xtermRef.current.writeln(
              `\r\n\x1b[90mShell exited with code ${exit_code ?? "unknown"}\x1b[0m`
            );
            markTerminalExited(terminal_id);
            currentTerminalIdRef.current = null;
          }
        }
      );
    };

    if (mounted) {
      setupListeners();
    }

    return () => {
      mounted = false;
      unlistenOutputRef.current?.();
      unlistenExitRef.current?.();
    };
  }, [markTerminalExited]);

  // Initialize xterm UI and connect to existing or new terminal
  useEffect(() => {
    if (isCollapsed || !terminalRef.current) return;

    let mounted = true;
    let resizeObserver: ResizeObserver | null = null;

    const theme = getTerminalTheme(resolvedTheme);
    const terminal = new Terminal({
      cursorBlink: true,
      fontSize: 12,
      fontFamily: '"SF Mono", Menlo, Monaco, "Courier New", monospace',
      theme,
      scrollback: 5000,
      convertEol: true,
    });

    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);

    terminal.open(terminalRef.current);
    xtermRef.current = terminal;
    fitAddonRef.current = fitAddon;

    // Fit after a small delay to ensure DOM is ready
    requestAnimationFrame(() => {
      if (mounted) {
        fitAddon.fit();
      }
    });

    // Handle keyboard input - send to PTY
    terminal.onData((data) => {
      if (currentTerminalIdRef.current) {
        invoke("write_terminal", {
          terminal_id: currentTerminalIdRef.current,
          data,
        }).catch((err) => console.error("Failed to write to terminal:", err));
      }
    });

    // Check if we have an existing terminal for this project
    const existingTerminalId = getTerminalId(projectId);
    
    if (existingTerminalId) {
      // Reconnect to existing terminal
      currentTerminalIdRef.current = existingTerminalId;
      terminal.writeln("\x1b[90m[Reconnected to existing session]\x1b[0m\r\n");
    } else {
      // Spawn new terminal for this project
      const spawnNewTerminal = async () => {
        if (!mounted) return;
        
        setIsSpawning(true);
        try {
          const cols = xtermRef.current?.cols ?? 80;
          const rows = xtermRef.current?.rows ?? 24;

          const result = await invoke<SpawnTerminalResult>("spawn_terminal", {
            working_directory: projectPath,
            cols,
            rows,
          });

          if (mounted) {
            currentTerminalIdRef.current = result.terminal_id;
            registerTerminal(projectId, result.terminal_id, projectPath);
          } else {
            // Component unmounted during spawn, kill the terminal
            await invoke("kill_terminal", { terminal_id: result.terminal_id });
          }
        } catch (error) {
          console.error("Failed to spawn terminal:", error);
          if (xtermRef.current && mounted) {
            xtermRef.current.writeln(
              `\x1b[31mFailed to start shell: ${error}\x1b[0m`
            );
          }
        } finally {
          if (mounted) {
            setIsSpawning(false);
          }
        }
      };

      spawnNewTerminal();
    }

    // Handle resize
    resizeObserver = new ResizeObserver(() => {
      requestAnimationFrame(() => {
        if (fitAddonRef.current && xtermRef.current && mounted) {
          fitAddonRef.current.fit();

          // Notify PTY of resize
          if (currentTerminalIdRef.current) {
            invoke("resize_terminal", {
              terminal_id: currentTerminalIdRef.current,
              cols: xtermRef.current.cols,
              rows: xtermRef.current.rows,
            }).catch((err) => console.error("Failed to resize terminal:", err));
          }
        }
      });
    });

    if (terminalWrapperRef.current) {
      resizeObserver.observe(terminalWrapperRef.current);
    }

    return () => {
      mounted = false;
      resizeObserver?.disconnect();
      terminal.dispose();
      xtermRef.current = null;
      fitAddonRef.current = null;
      // Don't kill the terminal - keep it running for when we return
      currentTerminalIdRef.current = null;
    };
  }, [isCollapsed, projectId, projectPath, resolvedTheme, getTerminalId, registerTerminal]);

  // When project changes while expanded, switch to that project's terminal
  useEffect(() => {
    if (isCollapsed || !xtermRef.current) return;

    const existingTerminalId = getTerminalId(projectId);
    
    if (existingTerminalId && existingTerminalId !== currentTerminalIdRef.current) {
      // Switch to the existing terminal for this project
      currentTerminalIdRef.current = existingTerminalId;
      xtermRef.current.clear();
      xtermRef.current.writeln("\x1b[90m[Switched to project terminal]\x1b[0m\r\n");
    } else if (!existingTerminalId && !hasTerminal(projectId)) {
      // No terminal for this project, spawn one
      const spawnNewTerminal = async () => {
        if (!xtermRef.current) return;
        
        xtermRef.current.clear();
        setIsSpawning(true);
        
        try {
          const cols = xtermRef.current.cols ?? 80;
          const rows = xtermRef.current.rows ?? 24;

          const result = await invoke<SpawnTerminalResult>("spawn_terminal", {
            working_directory: projectPath,
            cols,
            rows,
          });

          currentTerminalIdRef.current = result.terminal_id;
          registerTerminal(projectId, result.terminal_id, projectPath);
        } catch (error) {
          console.error("Failed to spawn terminal:", error);
          if (xtermRef.current) {
            xtermRef.current.writeln(
              `\x1b[31mFailed to start shell: ${error}\x1b[0m`
            );
          }
        } finally {
          setIsSpawning(false);
        }
      };

      spawnNewTerminal();
    }
  }, [projectId, projectPath, isCollapsed, getTerminalId, hasTerminal, registerTerminal]);

  // Fit terminal when height changes
  useEffect(() => {
    if (!isCollapsed && fitAddonRef.current) {
      requestAnimationFrame(() => {
        fitAddonRef.current?.fit();

        // Notify PTY of resize
        if (currentTerminalIdRef.current && xtermRef.current) {
          invoke("resize_terminal", {
            terminal_id: currentTerminalIdRef.current,
            cols: xtermRef.current.cols,
            rows: xtermRef.current.rows,
          }).catch((err) => console.error("Failed to resize terminal:", err));
        }
      });
    }
  }, [height, isCollapsed]);

  const toggleCollapse = () => {
    setIsCollapsed(!isCollapsed);
  };

  const handleClear = () => {
    if (xtermRef.current) {
      xtermRef.current.clear();
    }
  };

  const handleRestart = async () => {
    if (!xtermRef.current) return;

    xtermRef.current.clear();

    // Kill existing terminal for this project
    const existingId = getTerminalId(projectId);
    if (existingId) {
      unregisterTerminal(projectId);
      await invoke("kill_terminal", { terminal_id: existingId }).catch((err) =>
        console.error("Failed to kill terminal:", err)
      );
    }
    currentTerminalIdRef.current = null;

    // Spawn new terminal
    setIsSpawning(true);
    try {
      const cols = xtermRef.current?.cols ?? 80;
      const rows = xtermRef.current?.rows ?? 24;

      const result = await invoke<SpawnTerminalResult>("spawn_terminal", {
        working_directory: projectPath,
        cols,
        rows,
      });

      currentTerminalIdRef.current = result.terminal_id;
      registerTerminal(projectId, result.terminal_id, projectPath);
    } catch (error) {
      console.error("Failed to spawn terminal:", error);
      if (xtermRef.current) {
        xtermRef.current.writeln(
          `\x1b[31mFailed to start shell: ${error}\x1b[0m`
        );
      }
    } finally {
      setIsSpawning(false);
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
            ? "cursor-default"
            : "cursor-ns-resize hover:bg-accent/30 active:bg-accent/50"
        } ${isResizing ? "bg-accent/50" : ""}`}
      />

      {/* Header */}
      <div className={`flex items-center justify-between px-4 h-8 flex-shrink-0 ${isCollapsed ? "" : "border-b border-border"}`}>
        <button
          onClick={toggleCollapse}
          className="flex items-center gap-2 hover:text-foreground transition-colors"
        >
          <svg
            className={`w-3 h-3 text-muted transition-transform ${
              isCollapsed ? "" : "rotate-180"
            }`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M5 15l7-7 7 7"
            />
          </svg>
          <span className="text-xs font-medium text-muted uppercase tracking-wider">
            Terminal
          </span>
          {isSpawning && (
            <span className="w-2 h-2 rounded-full bg-accent animate-pulse" />
          )}
          {!isCollapsed && hasTerminal(projectId) && (
            <span className="w-2 h-2 rounded-full bg-success" title="Terminal running" />
          )}
        </button>

        <div className="flex items-center gap-2">
          <button
            onClick={handleClear}
            className="p-1 rounded transition-colors text-muted hover:text-foreground hover:bg-card"
            title="Clear terminal"
          >
            <svg
              className="w-3.5 h-3.5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
              />
            </svg>
          </button>

          <button
            onClick={handleRestart}
            className="p-1 rounded transition-colors text-muted hover:text-foreground hover:bg-card"
            title="Restart shell"
          >
            <svg
              className="w-3.5 h-3.5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
          </button>
        </div>
      </div>

      {/* Terminal content */}
      {!isCollapsed && (
        <div className="relative flex-1 overflow-hidden">
          <div ref={terminalWrapperRef} className="absolute inset-0 py-2 px-3">
            <div ref={terminalRef} className="h-full w-full overflow-hidden" />
          </div>
        </div>
      )}
    </div>
  );
}
