import { useState } from "react";
import type { LogEntry } from "../stores/buildStore";

interface PreviousLogsPanelProps {
  previousLogs: LogEntry[][];
}

export function PreviousLogsPanel({ previousLogs }: PreviousLogsPanelProps) {
  const [expandedAttempt, setExpandedAttempt] = useState<number | null>(null);

  const toggleAttempt = (index: number) => {
    setExpandedAttempt(expandedAttempt === index ? null : index);
  };

  const formatTimestamp = (date: Date) => {
    return date.toLocaleTimeString();
  };

  const getLogTypeColor = (type: LogEntry["type"]) => {
    switch (type) {
      case "stdout":
        return "text-gray-400";
      case "stderr":
        return "text-red-400";
      case "system":
        return "text-blue-400";
      default:
        return "text-gray-400";
    }
  };

  return (
    <div className="mt-2 border border-border rounded-lg bg-card/50 overflow-hidden">
      {previousLogs.map((logs, attemptIndex) => (
        <div key={attemptIndex} className="border-b border-border last:border-b-0">
          <button
            onClick={() => toggleAttempt(attemptIndex)}
            className="w-full px-3 py-2 flex items-center justify-between text-xs text-secondary hover:bg-accent/5 transition-colors"
          >
            <span className="font-medium">
              Attempt {attemptIndex + 1} ({logs.length} log entries)
            </span>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className={`transform transition-transform ${expandedAttempt === attemptIndex ? "rotate-180" : ""}`}
            >
              <path d="m6 9 6 6 6-6" />
            </svg>
          </button>
          {expandedAttempt === attemptIndex && (
            <div className="px-3 py-2 bg-[#1e1e1e] max-h-48 overflow-auto">
              <div className="font-mono text-xs space-y-0.5">
                {logs.map((log) => (
                  <div key={log.id} className="flex gap-2">
                    <span className="text-gray-600 shrink-0">
                      [{formatTimestamp(log.timestamp)}]
                    </span>
                    <span className={getLogTypeColor(log.type)}>
                      {log.content}
                    </span>
                  </div>
                ))}
                {logs.length === 0 && (
                  <span className="text-gray-500 italic">No logs recorded</span>
                )}
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
