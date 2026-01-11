import { useEffect, useRef, useState } from "react";
import { useBuildStore } from "../stores/buildStore";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";

export function LogPanel() {
  const logs = useBuildStore((state) => state.logs);
  const status = useBuildStore((state) => state.status);
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const lastLogCountRef = useRef(0);

  useEffect(() => {
    if (!terminalRef.current) return;

    const terminal = new Terminal({
      theme: {
        background: "#1e1e1e",
        foreground: "#d4d4d4",
        cursor: "#d4d4d4",
        cursorAccent: "#1e1e1e",
        selectionBackground: "#264f78",
        black: "#1e1e1e",
        red: "#f44747",
        green: "#6a9955",
        yellow: "#dcdcaa",
        blue: "#569cd6",
        magenta: "#c586c0",
        cyan: "#4ec9b0",
        white: "#d4d4d4",
        brightBlack: "#808080",
        brightRed: "#f44747",
        brightGreen: "#6a9955",
        brightYellow: "#dcdcaa",
        brightBlue: "#569cd6",
        brightMagenta: "#c586c0",
        brightCyan: "#4ec9b0",
        brightWhite: "#ffffff",
      },
      fontSize: 13,
      fontFamily: '"SF Mono", "Monaco", "Menlo", "Ubuntu Mono", monospace',
      cursorBlink: false,
      disableStdin: true,
      convertEol: true,
      scrollback: 5000,
    });

    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);

    terminal.open(terminalRef.current);
    fitAddon.fit();

    xtermRef.current = terminal;
    fitAddonRef.current = fitAddon;

    terminal.onScroll(() => {
      if (!xtermRef.current) return;
      const buffer = xtermRef.current.buffer.active;
      const isAtBottom =
        buffer.viewportY >= buffer.baseY;
      setAutoScroll(isAtBottom);
    });

    const resizeObserver = new ResizeObserver(() => {
      fitAddonRef.current?.fit();
    });
    resizeObserver.observe(terminalRef.current);

    return () => {
      resizeObserver.disconnect();
      terminal.dispose();
      xtermRef.current = null;
      fitAddonRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!xtermRef.current) return;

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
          prefix = `\x1b[90m[${timestamp}]\x1b[0m \x1b[34m`;
          break;
      }

      const suffix = log.type === "stdout" ? "" : "\x1b[0m";
      xtermRef.current.writeln(`${prefix}${log.content}${suffix}`);
    }

    if (autoScroll) {
      xtermRef.current.scrollToBottom();
    }
  }, [logs, autoScroll]);

  const isEmpty = logs.length === 0;

  const handleScrollToBottom = () => {
    setAutoScroll(true);
    xtermRef.current?.scrollToBottom();
  };

  return (
    <div className="border border-border rounded-xl overflow-hidden bg-[#1e1e1e] mt-6">
      <div className="flex items-center justify-between px-4 py-2 bg-[#252526] border-b border-[#3c3c3c]">
        <span className="text-xs font-medium text-gray-400">Terminal</span>
        {!isEmpty && !autoScroll && (
          <button
            onClick={handleScrollToBottom}
            className="text-xs text-blue-400 hover:text-blue-300"
          >
            Scroll to bottom
          </button>
        )}
      </div>
      <div className="relative h-64">
        {isEmpty && (
          <div className="absolute inset-0 flex items-center justify-center text-gray-500 z-10 pointer-events-none">
            {status === "idle"
              ? "Waiting for build to start..."
              : "No output yet..."}
          </div>
        )}
        <div
          ref={terminalRef}
          className="h-full w-full"
          style={{ padding: "8px" }}
        />
      </div>
    </div>
  );
}
