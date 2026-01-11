import { useEffect, useRef, useState } from "react";
import { useBuildStore, type LogEntry } from "../stores/buildStore";

export function LogPanel() {
  const logs = useBuildStore((state) => state.logs);
  const status = useBuildStore((state) => state.status);
  const containerRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);

  useEffect(() => {
    if (autoScroll && containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [logs, autoScroll]);

  const handleScroll = () => {
    if (!containerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 20;
    setAutoScroll(isAtBottom);
  };

  const getLogColor = (type: LogEntry["type"]) => {
    switch (type) {
      case "stdout":
        return "text-gray-200";
      case "stderr":
        return "text-red-400";
      case "system":
        return "text-blue-400";
      default:
        return "text-gray-200";
    }
  };

  const isEmpty = logs.length === 0;

  return (
    <div className="border border-border rounded-xl overflow-hidden bg-[#1e1e1e] mt-6">
      <div className="flex items-center justify-between px-4 py-2 bg-[#252526] border-b border-[#3c3c3c]">
        <span className="text-xs font-medium text-gray-400">Terminal</span>
        {!isEmpty && !autoScroll && (
          <button
            onClick={() => {
              setAutoScroll(true);
              if (containerRef.current) {
                containerRef.current.scrollTop =
                  containerRef.current.scrollHeight;
              }
            }}
            className="text-xs text-blue-400 hover:text-blue-300"
          >
            Scroll to bottom
          </button>
        )}
      </div>
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="h-64 overflow-auto p-4 font-mono text-sm"
      >
        {isEmpty ? (
          <div className="h-full flex items-center justify-center text-gray-500">
            {status === "idle"
              ? "Waiting for build to start..."
              : "No output yet..."}
          </div>
        ) : (
          <div className="space-y-0.5">
            {logs.map((log) => (
              <div key={log.id} className={getLogColor(log.type)}>
                <span className="text-gray-500 select-none">
                  [{log.timestamp.toLocaleTimeString()}]{" "}
                </span>
                <span className="whitespace-pre-wrap break-all">
                  {log.content}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
