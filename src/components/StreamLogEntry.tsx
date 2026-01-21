import React, { useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface StreamLogEntryProps {
  content: string;
  timestamp: Date;
  type: "stdout" | "stderr" | "system";
}

interface AmpMessage {
  type: string;
  subtype?: string;
  message?: {
    role: string;
    content: Array<{
      type: string;
      text?: string;
      name?: string;
      input?: Record<string, unknown>;
      content?: string;
      is_error?: boolean;
    }>;
    stop_reason?: string;
    usage?: {
      input_tokens?: number;
      output_tokens?: number;
      cache_read_input_tokens?: number;
    };
  };
  result?: string;
  is_error?: boolean;
  duration_ms?: number;
  num_turns?: number;
  tools?: string[];
  cwd?: string;
  // Claude Code stream-json additional fields
  tool_name?: string;
  tool_input?: Record<string, unknown>;
  error?: string;
  content?: string;
  text?: string;
  // System status fields
  status?: string;
  session_id?: string;
  uuid?: string;
}

function tryParseJson(content: string): AmpMessage | null {
  const trimmed = content.trim();
  if (!trimmed.startsWith("{")) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    return null;
  }
}

function formatPath(path: string): string {
  const normalized = path.replace(/\\/g, "/");
  const parts = normalized.split("/");
  return parts.slice(-2).join("/");
}

// Icon components for tool display
function ToolIcon({ name }: { name: string }) {
  const iconClass = "w-3.5 h-3.5";
  
  switch (name) {
    case "Read":
      return (
        <svg className={iconClass} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      );
    case "Bash":
      return (
        <svg className={iconClass} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      );
    case "edit_file":
    case "create_file":
      return (
        <svg className={iconClass} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
        </svg>
      );
    case "Grep":
    case "finder":
      return (
        <svg className={iconClass} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
      );
    case "glob":
      return (
        <svg className={iconClass} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
        </svg>
      );
    default:
      return (
        <svg className={iconClass} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      );
  }
}

function ToolUseCard({ name, input }: { name: string; input?: Record<string, unknown> }) {
  const [isExpanded, setIsExpanded] = useState(false);
  let detail = "";
  let fullDetail = "";
  
  if (input) {
    if (name === "Read" && input.path) {
      detail = formatPath(input.path as string);
      fullDetail = input.path as string;
    } else if (name === "Bash" && input.cmd) {
      const cmd = input.cmd as string;
      detail = cmd.length > 80 ? cmd.substring(0, 80) + "..." : cmd;
      fullDetail = cmd;
    } else if ((name === "edit_file" || name === "create_file") && input.path) {
      detail = formatPath(input.path as string);
      fullDetail = input.path as string;
    } else if (name === "Grep" && input.pattern) {
      detail = `"${input.pattern}"`;
      if (input.path) {
        detail += ` in ${formatPath(input.path as string)}`;
        fullDetail = `Pattern: ${input.pattern}\nPath: ${input.path}`;
      } else {
        fullDetail = `Pattern: ${input.pattern}`;
      }
    } else if (name === "glob" && input.filePattern) {
      detail = input.filePattern as string;
      fullDetail = input.filePattern as string;
    } else if (name === "finder" && input.query) {
      const q = input.query as string;
      detail = q.length > 60 ? q.substring(0, 60) + "..." : q;
      fullDetail = q;
    } else {
      // For other tools, show a summary
      const keys = Object.keys(input);
      if (keys.length > 0) {
        detail = keys.slice(0, 2).join(", ");
        fullDetail = JSON.stringify(input, null, 2);
      }
    }
  }

  const hasExpandableContent = fullDetail && fullDetail !== detail;

  return (
    <div className="group">
      <button
        onClick={() => hasExpandableContent && setIsExpanded(!isExpanded)}
        className={`flex items-center gap-2 px-2.5 py-1.5 rounded-md bg-accent/10 border border-accent/20 text-accent ${
          hasExpandableContent ? "cursor-pointer hover:bg-accent/15 hover:border-accent/30" : "cursor-default"
        } transition-colors`}
      >
        <ToolIcon name={name} />
        <span className="font-medium text-xs">{name}</span>
        {detail && <span className="text-accent/70 text-xs font-mono truncate max-w-[300px]">{detail}</span>}
        {hasExpandableContent && (
          <svg className={`w-3 h-3 text-accent/50 transition-transform ${isExpanded ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        )}
      </button>
      {isExpanded && fullDetail && (
        <pre className="mt-1.5 ml-1 p-2 text-[10px] font-mono bg-card border border-border rounded text-secondary overflow-x-auto max-h-32 select-text">
          {fullDetail}
        </pre>
      )}
    </div>
  );
}

function AssistantTextDisplay({ text, truncateAt = 800 }: { text: string; truncateAt?: number }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const shouldTruncate = text.length > truncateAt;
  const displayText = shouldTruncate && !isExpanded ? text.substring(0, truncateAt) + "..." : text;
  
  return (
    <div className="py-2 pl-3 border-l-2 border-accent/40 bg-card/30 rounded-r-md">
      <div className="prose prose-sm max-w-none 
        prose-p:my-1 prose-p:text-secondary
        prose-headings:text-foreground prose-headings:my-2
        prose-strong:text-foreground
        prose-code:text-accent prose-code:bg-background/50 prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:text-xs
        prose-pre:bg-background prose-pre:border prose-pre:border-border prose-pre:rounded-md prose-pre:my-2 prose-pre:text-xs
        prose-ul:my-1 prose-ol:my-1 prose-li:my-0.5 prose-li:text-secondary
        prose-a:text-accent prose-a:no-underline hover:prose-a:underline
        select-text">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>
          {displayText}
        </ReactMarkdown>
      </div>
      {shouldTruncate && (
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="mt-1 text-xs text-accent hover:text-accent/80 transition-colors"
        >
          {isExpanded ? "Show less" : "Show more"}
        </button>
      )}
    </div>
  );
}

interface TokenUsage {
  input_tokens?: number;
  output_tokens?: number;
  cache_read_input_tokens?: number;
}

function TokenUsageBadge({ usage }: { usage?: TokenUsage }) {
  if (!usage) return null;
  
  const { input_tokens, output_tokens, cache_read_input_tokens } = usage;
  const cached = cache_read_input_tokens ? ` (${cache_read_input_tokens} cached)` : "";
  
  return (
    <span className="text-[10px] px-1.5 py-0.5 rounded bg-card border border-border text-muted font-mono">
      {input_tokens || 0}{cached} → {output_tokens || 0}
    </span>
  );
}

function TimeStamp({ time }: { time: string }) {
  return <span className="text-[10px] text-muted/60 font-mono">{time}</span>;
}

export function StreamLogEntry({ content, timestamp, type }: StreamLogEntryProps) {
  const parsed = useMemo(() => tryParseJson(content), [content]);
  const timeStr = timestamp.toISOString().slice(11, 19);

  // Not JSON - render as plain text
  if (!parsed) {
    return (
      <div className={`py-1 break-words font-mono text-xs ${
        type === "stderr" ? "text-destructive" :
        type === "system" ? "text-accent" :
        "text-secondary"
      }`}>
        <TimeStamp time={timeStr} />
        <span className="ml-2">{content}</span>
      </div>
    );
  }

  // System init message
  if (parsed.type === "system" && parsed.subtype === "init") {
    return (
      <div className="py-2 px-3 my-1 bg-success/10 border border-success/20 rounded-lg flex items-center gap-3">
        <div className="w-8 h-8 rounded-full bg-success/20 flex items-center justify-center">
          <svg className="w-4 h-4 text-success" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className="text-success font-medium text-sm">Session Started</span>
            <TimeStamp time={timeStr} />
          </div>
          <div className="text-xs text-muted mt-0.5">
            {parsed.tools?.length || 0} tools available • {formatPath(parsed.cwd || "")}
          </div>
        </div>
      </div>
    );
  }

  // System status message (compacting, etc.)
  if (parsed.type === "system" && parsed.subtype === "status" && parsed.status) {
    const statusIcons: Record<string, { icon: React.ReactNode; color: string; label: string }> = {
      compacting: {
        icon: (
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" />
          </svg>
        ),
        color: "text-warning",
        label: "Compacting context..."
      },
      thinking: {
        icon: (
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
          </svg>
        ),
        color: "text-accent",
        label: "Thinking..."
      },
      processing: {
        icon: (
          <svg className="w-3 h-3 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        ),
        color: "text-muted",
        label: "Processing..."
      }
    };
    
    const statusInfo = statusIcons[parsed.status] || {
      icon: (
        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
      color: "text-muted",
      label: parsed.status.charAt(0).toUpperCase() + parsed.status.slice(1)
    };

    return (
      <div className="py-1.5 flex items-center gap-2">
        <TimeStamp time={timeStr} />
        <div className={`flex items-center gap-1.5 px-2 py-1 rounded bg-card/50 border border-border ${statusInfo.color}`}>
          {statusInfo.icon}
          <span className="text-xs">{statusInfo.label}</span>
        </div>
      </div>
    );
  }

  // User message (usually the prompt)
  if (parsed.type === "user" && parsed.message?.content) {
    const textContent = parsed.message.content.find(c => c.type === "text");
    const toolResults = parsed.message.content.filter(c => c.type === "tool_result");
    
    if (textContent?.text) {
      return (
        <div className="py-2 px-3 my-1 bg-blue-500/10 border border-blue-500/20 rounded-lg">
          <div className="flex items-center gap-2 mb-1.5">
            <div className="w-5 h-5 rounded-full bg-blue-500/20 flex items-center justify-center">
              <svg className="w-3 h-3 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
            </div>
            <span className="text-blue-400 font-medium text-xs">Prompt</span>
            <TimeStamp time={timeStr} />
          </div>
          <div className="text-secondary text-sm pl-7 select-text">{textContent.text}</div>
        </div>
      );
    }
    
    if (toolResults.length > 0) {
      return (
        <div className="py-1.5 flex items-center gap-2">
          <TimeStamp time={timeStr} />
          <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-card border border-border">
            <svg className="w-3 h-3 text-success" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="text-xs text-muted">
              {toolResults.length} tool result{toolResults.length > 1 ? "s" : ""} received
            </span>
          </div>
        </div>
      );
    }
    
    return null;
  }

  // Assistant message
  if (parsed.type === "assistant" && parsed.message?.content) {
    const toolUses = parsed.message.content.filter(c => c.type === "tool_use");
    const textContent = parsed.message.content.filter(c => c.type === "text" && c.text);
    
    return (
      <div className="py-2 space-y-2">
        {/* Text content */}
        {textContent.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <div className="w-5 h-5 rounded-full bg-accent/20 flex items-center justify-center">
                <svg className="w-3 h-3 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
              </div>
              <span className="text-accent font-medium text-xs">Assistant</span>
              <TimeStamp time={timeStr} />
              <TokenUsageBadge usage={parsed.message?.usage} />
            </div>
            {textContent.map((item, i) => (
              <div key={i} className="ml-7">
                <AssistantTextDisplay text={item.text!} />
              </div>
            ))}
          </div>
        )}
        
        {/* Tool uses */}
        {toolUses.length > 0 && (
          <div>
            {textContent.length === 0 && (
              <div className="flex items-center gap-2 mb-1.5">
                <div className="w-5 h-5 rounded-full bg-accent/20 flex items-center justify-center">
                  <svg className="w-3 h-3 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                </div>
                <span className="text-accent font-medium text-xs">Tools</span>
                <TimeStamp time={timeStr} />
                <TokenUsageBadge usage={parsed.message?.usage} />
              </div>
            )}
            <div className="ml-7 flex flex-wrap gap-2">
              {toolUses.map((tool, i) => (
                <ToolUseCard key={i} name={tool.name!} input={tool.input} />
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  // Result message
  if (parsed.type === "result") {
    const duration = parsed.duration_ms ? `${(parsed.duration_ms / 1000).toFixed(1)}s` : "";
    const turns = parsed.num_turns ? `${parsed.num_turns} turns` : "";
    
    if (parsed.is_error) {
      return (
        <div className="py-2 px-3 my-1 bg-destructive/10 border border-destructive/20 rounded-lg flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-destructive/20 flex items-center justify-center">
            <svg className="w-4 h-4 text-destructive" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <span className="text-destructive font-medium text-sm">Failed</span>
              <TimeStamp time={timeStr} />
            </div>
            <div className="text-xs text-destructive/80 mt-0.5 select-text">
              {parsed.result || "Unknown error"}
            </div>
          </div>
        </div>
      );
    }
    
    return (
      <div className="py-2 px-3 my-1 bg-success/10 border border-success/20 rounded-lg flex items-center gap-3">
        <div className="w-8 h-8 rounded-full bg-success/20 flex items-center justify-center">
          <svg className="w-4 h-4 text-success" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className="text-success font-medium text-sm">Complete</span>
            <TimeStamp time={timeStr} />
            {(duration || turns) && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-card border border-border text-muted">
                {[duration, turns].filter(Boolean).join(" • ")}
              </span>
            )}
          </div>
          {parsed.result && (
            <div className="text-xs text-success/80 mt-0.5 select-text truncate max-w-lg">
              {parsed.result}
            </div>
          )}
        </div>
      </div>
    );
  }

  // Claude Code stream-json: message type with text content
  if (parsed.type === "message" && (parsed.content || parsed.text)) {
    const text = parsed.content || parsed.text || "";
    return (
      <div className="py-2">
        <div className="flex items-center gap-2 mb-1.5">
          <div className="w-5 h-5 rounded-full bg-accent/20 flex items-center justify-center">
            <svg className="w-3 h-3 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
          </div>
          <span className="text-accent font-medium text-xs">Message</span>
          <TimeStamp time={timeStr} />
        </div>
        <div className="ml-7">
          <AssistantTextDisplay text={text} />
        </div>
      </div>
    );
  }

  // Claude Code stream-json: tool_use type
  if (parsed.type === "tool_use" && parsed.tool_name) {
    return (
      <div className="py-1.5 flex items-center gap-2">
        <TimeStamp time={timeStr} />
        <ToolUseCard name={parsed.tool_name} input={parsed.tool_input} />
      </div>
    );
  }

  // Claude Code stream-json: tool_result type
  if (parsed.type === "tool_result") {
    return (
      <div className="py-1.5 flex items-center gap-2">
        <TimeStamp time={timeStr} />
        <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-card border border-border">
          <svg className="w-3 h-3 text-success" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span className="text-xs text-muted">Tool result received</span>
        </div>
      </div>
    );
  }

  // Claude Code stream-json: error type
  if (parsed.type === "error" && parsed.error) {
    return (
      <div className="py-2 px-3 my-1 bg-destructive/10 border border-destructive/20 rounded-lg flex items-start gap-3">
        <div className="w-6 h-6 rounded-full bg-destructive/20 flex items-center justify-center flex-shrink-0 mt-0.5">
          <svg className="w-3.5 h-3.5 text-destructive" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-destructive font-medium text-xs">Error</span>
            <TimeStamp time={timeStr} />
          </div>
          <div className="text-xs text-destructive/80 mt-1 select-text break-words">
            {parsed.error}
          </div>
        </div>
      </div>
    );
  }

  // Unknown JSON type - try to extract useful content
  const extractedText = parsed.result || parsed.content || parsed.text || 
    (parsed.message?.content?.find(c => c.type === "text")?.text);
  
  if (extractedText) {
    return (
      <div className="py-2">
        <div className="flex items-center gap-2 mb-1.5">
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-card border border-border text-muted font-mono">
            {parsed.type}
          </span>
          <TimeStamp time={timeStr} />
        </div>
        <AssistantTextDisplay text={extractedText} />
      </div>
    );
  }

  // Last resort: show type and abbreviated JSON for debugging
  const jsonPreview = JSON.stringify(parsed, null, 2);
  return (
    <div className="py-1.5">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-[10px] px-1.5 py-0.5 rounded bg-warning/20 border border-warning/30 text-warning font-mono">
          {parsed.type || "unknown"}
        </span>
        <TimeStamp time={timeStr} />
      </div>
      <pre className="text-[10px] font-mono bg-card border border-border rounded p-2 text-muted overflow-x-auto max-h-24 select-text">
        {jsonPreview.length > 300 ? jsonPreview.substring(0, 300) + "..." : jsonPreview}
      </pre>
    </div>
  );
}
