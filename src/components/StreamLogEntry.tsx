import { useMemo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface StreamLogEntryProps {
  content: string;
  timestamp: Date;
  type: "stdout" | "stderr" | "system";
}

interface AmpMessage {
  type: "system" | "user" | "assistant" | "result";
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
  const parts = path.split("/");
  return parts.slice(-2).join("/");
}

function ToolUseDisplay({ name, input }: { name: string; input?: Record<string, unknown> }) {
  let detail = "";
  
  if (input) {
    if (name === "Read" && input.path) {
      detail = formatPath(input.path as string);
    } else if (name === "Bash" && input.cmd) {
      const cmd = input.cmd as string;
      detail = cmd.length > 60 ? cmd.substring(0, 60) + "..." : cmd;
    } else if ((name === "edit_file" || name === "create_file") && input.path) {
      detail = formatPath(input.path as string);
    } else if (name === "Grep" && input.pattern) {
      detail = `"${input.pattern}"`;
      if (input.path) detail += ` in ${formatPath(input.path as string)}`;
    } else if (name === "glob" && input.filePattern) {
      detail = input.filePattern as string;
    } else if (name === "finder" && input.query) {
      const q = input.query as string;
      detail = q.length > 50 ? q.substring(0, 50) + "..." : q;
    }
  }

  return (
    <div className="flex items-center gap-2 py-0.5">
      <span className="text-purple-400 font-medium">⚙ {name}</span>
      {detail && <span className="text-muted truncate">{detail}</span>}
    </div>
  );
}

function AssistantTextDisplay({ text }: { text: string }) {
  // Truncate very long text
  const displayText = text.length > 500 ? text.substring(0, 500) + "..." : text;
  
  return (
    <div className="py-1 pl-3 border-l-2 border-accent/30 text-secondary prose prose-sm prose-invert max-w-none prose-p:my-1 prose-headings:my-2 prose-pre:my-1 prose-pre:bg-background prose-pre:text-xs prose-code:text-accent prose-code:bg-background/50 prose-code:px-1 prose-code:rounded">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>
        {displayText}
      </ReactMarkdown>
    </div>
  );
}

interface TokenUsage {
  input_tokens?: number;
  output_tokens?: number;
  cache_read_input_tokens?: number;
}

function TokenUsageDisplay({ usage }: { usage?: TokenUsage }) {
  if (!usage) return null;
  
  const { input_tokens, output_tokens, cache_read_input_tokens } = usage;
  const cached = cache_read_input_tokens ? ` (${cache_read_input_tokens} cached)` : "";
  
  return (
    <span className="text-[10px] text-muted/60 ml-2">
      [{input_tokens || 0}{cached} → {output_tokens || 0}]
    </span>
  );
}

export function StreamLogEntry({ content, timestamp, type }: StreamLogEntryProps) {
  const parsed = useMemo(() => tryParseJson(content), [content]);
  const timeStr = timestamp.toISOString().slice(11, 19);

  // Not JSON - render as plain text
  if (!parsed) {
    return (
      <div className={`break-words ${
        type === "stderr" ? "text-destructive" :
        type === "system" ? "text-accent" :
        "text-secondary"
      }`}>
        <span className="text-muted mr-2">[{timeStr}]</span>
        {content}
      </div>
    );
  }

  // System init message
  if (parsed.type === "system" && parsed.subtype === "init") {
    return (
      <div className="text-accent flex items-center gap-2">
        <span className="text-muted mr-2">[{timeStr}]</span>
        <span className="text-success">🚀 Session started</span>
        <span className="text-muted text-[10px]">
          {parsed.tools?.length || 0} tools • {formatPath(parsed.cwd || "")}
        </span>
      </div>
    );
  }

  // User message (usually the prompt)
  if (parsed.type === "user" && parsed.message?.content) {
    const textContent = parsed.message.content.find(c => c.type === "text");
    const toolResults = parsed.message.content.filter(c => c.type === "tool_result");
    
    if (textContent?.text) {
      const text = textContent.text;
      const preview = text.length > 150 ? text.substring(0, 150) + "..." : text;
      return (
        <div className="text-blue-400">
          <span className="text-muted mr-2">[{timeStr}]</span>
          <span className="font-medium">📝 Prompt:</span>
          <span className="text-blue-300/80 ml-2">{preview}</span>
        </div>
      );
    }
    
    if (toolResults.length > 0) {
      return (
        <div className="text-muted">
          <span className="mr-2">[{timeStr}]</span>
          <span className="text-green-400/70">← {toolResults.length} tool result{toolResults.length > 1 ? "s" : ""}</span>
        </div>
      );
    }
    
    return null; // Skip empty user messages
  }

  // Assistant message
  if (parsed.type === "assistant" && parsed.message?.content) {
    const toolUses = parsed.message.content.filter(c => c.type === "tool_use");
    const textContent = parsed.message.content.filter(c => c.type === "text" && c.text);
    
    return (
      <div className="space-y-1">
        {textContent.map((item, i) => (
          <div key={i}>
            <span className="text-muted mr-2">[{timeStr}]</span>
            <AssistantTextDisplay text={item.text!} />
          </div>
        ))}
        {toolUses.length > 0 && (
          <div>
            <span className="text-muted mr-2">[{timeStr}]</span>
            <div className="inline-flex flex-wrap gap-x-4 gap-y-1">
              {toolUses.map((tool, i) => (
                <ToolUseDisplay key={i} name={tool.name!} input={tool.input} />
              ))}
            </div>
            <TokenUsageDisplay usage={parsed.message?.usage} />
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
        <div className="text-destructive font-medium">
          <span className="text-muted mr-2">[{timeStr}]</span>
          ❌ Failed: {parsed.result || "Unknown error"}
        </div>
      );
    }
    
    return (
      <div className="text-success font-medium">
        <span className="text-muted mr-2">[{timeStr}]</span>
        ✅ Complete
        {(duration || turns) && (
          <span className="text-muted font-normal text-[10px] ml-2">
            ({[duration, turns].filter(Boolean).join(" • ")})
          </span>
        )}
      </div>
    );
  }

  // Unknown JSON type - show minimal info
  return (
    <div className="text-muted">
      <span className="mr-2">[{timeStr}]</span>
      <span className="text-muted/60">[{parsed.type}]</span>
    </div>
  );
}
