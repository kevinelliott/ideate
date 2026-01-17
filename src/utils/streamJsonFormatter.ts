/**
 * Format streaming JSON output from agents into human-readable log entries.
 * Supports Amp and Claude Code streaming formats.
 * Also converts markdown to ANSI escape codes for terminal display.
 */

// ANSI escape codes for terminal styling
const ANSI = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  italic: '\x1b[3m',
  underline: '\x1b[4m',
  cyan: '\x1b[36m',
  yellow: '\x1b[33m',
  green: '\x1b[32m',
  magenta: '\x1b[35m',
  blue: '\x1b[34m',
  gray: '\x1b[90m',
  bgGray: '\x1b[48;5;236m',
};

/**
 * Convert markdown text to ANSI-styled text for terminal display.
 */
function markdownToAnsi(text: string): string {
  let result = text;

  // Code blocks (```...```) - must be done before inline code
  result = result.replace(/```(\w*)\n?([\s\S]*?)```/g, (_match, _lang, code) => {
    const lines = code.trim().split('\n');
    const formatted = lines.map((line: string) => `${ANSI.bgGray}${ANSI.cyan}  ${line}  ${ANSI.reset}`).join('\n');
    return `\n${formatted}\n`;
  });

  // Inline code (`...`)
  result = result.replace(/`([^`]+)`/g, `${ANSI.cyan}$1${ANSI.reset}`);

  // Bold (**...**)
  result = result.replace(/\*\*([^*]+)\*\*/g, `${ANSI.bold}$1${ANSI.reset}`);

  // Italic (*...*)
  result = result.replace(/\*([^*]+)\*/g, `${ANSI.italic}$1${ANSI.reset}`);

  // Headers (# ... at start of line)
  result = result.replace(/^(#{1,6})\s+(.+)$/gm, (_match, hashes, title) => {
    const level = hashes.length;
    if (level <= 2) {
      return `${ANSI.bold}${ANSI.yellow}${title}${ANSI.reset}`;
    }
    return `${ANSI.bold}${title}${ANSI.reset}`;
  });

  // Bullet lists (- or *)
  result = result.replace(/^(\s*)[-*]\s+/gm, `$1${ANSI.cyan}•${ANSI.reset} `);

  // Numbered lists (1. 2. etc)
  result = result.replace(/^(\s*)(\d+)\.\s+/gm, `$1${ANSI.cyan}$2.${ANSI.reset} `);

  // Links [text](url) - show as underlined text
  result = result.replace(/\[([^\]]+)\]\([^)]+\)/g, `${ANSI.underline}${ANSI.blue}$1${ANSI.reset}`);

  return result;
}

interface AmpStreamMessage {
  type: 'system' | 'user' | 'assistant' | 'result';
  subtype?: string;
  message?: {
    role: string;
    content: Array<{
      type: string;
      text?: string;
      name?: string;
      input?: Record<string, unknown>;
    }>;
    stop_reason?: string;
    usage?: {
      input_tokens?: number;
      output_tokens?: number;
    };
  };
  result?: string;
  is_error?: boolean;
  duration_ms?: number;
  session_id?: string;
  tools?: string[];
  cwd?: string;
}

interface ClaudeStreamMessage {
  type: string;
  message?: string;
  tool_name?: string;
  tool_input?: Record<string, unknown>;
  result?: string;
  error?: string;
}

export function formatStreamJson(content: string): string | null {
  // Check if this looks like JSON
  const trimmed = content.trim();
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) {
    return null; // Not JSON, return null to use original content
  }

  try {
    const parsed = JSON.parse(trimmed);
    return formatParsedMessage(parsed);
  } catch {
    return null; // Failed to parse, return null to use original content
  }
}

function formatParsedMessage(msg: AmpStreamMessage | ClaudeStreamMessage): string {
  // Handle Amp streaming format
  if ('session_id' in msg || msg.type === 'system' || msg.type === 'user' || msg.type === 'assistant' || msg.type === 'result') {
    return formatAmpMessage(msg as AmpStreamMessage);
  }

  // Handle Claude Code streaming format
  return formatClaudeMessage(msg as ClaudeStreamMessage);
}

function formatAmpMessage(msg: AmpStreamMessage): string {
  switch (msg.type) {
    case 'system':
      if (msg.subtype === 'init') {
        const toolCount = msg.tools?.length ?? 0;
        return `🚀 Session started (${toolCount} tools available)`;
      }
      return `[System] ${msg.subtype || 'message'}`;

    case 'user':
      // User message - extract prompt text
      if (msg.message?.content) {
        const textContent = msg.message.content.find(c => c.type === 'text');
        if (textContent?.text) {
          // Truncate long prompts
          const text = textContent.text;
          if (text.length > 200) {
            return `📝 Prompt: ${markdownToAnsi(text.substring(0, 200))}...`;
          }
          return `📝 Prompt: ${markdownToAnsi(text)}`;
        }
        // Check for tool results
        const toolResult = msg.message.content.find(c => c.type === 'tool_result');
        if (toolResult) {
          return `📎 Tool result received`;
        }
      }
      return `📝 User message`;

    case 'assistant':
      if (msg.message?.content) {
        const parts: string[] = [];
        
        for (const item of msg.message.content) {
          if (item.type === 'text' && item.text) {
            // Truncate long text responses
            const text = item.text;
            if (text.length > 300) {
              parts.push(`💬 ${text.substring(0, 300)}...`);
            } else {
              parts.push(`💬 ${text}`);
            }
          } else if (item.type === 'tool_use' && item.name) {
            const toolInput = item.input;
            let inputSummary = '';
            
            // Format common tool inputs nicely
            if (item.name === 'Read' && toolInput && typeof toolInput === 'object' && 'path' in toolInput) {
              const path = toolInput.path as string;
              inputSummary = ` → ${path.split('/').slice(-2).join('/')}`;
            } else if (item.name === 'Bash' && toolInput && typeof toolInput === 'object' && 'cmd' in toolInput) {
              const cmd = toolInput.cmd as string;
              inputSummary = ` → ${cmd.length > 50 ? cmd.substring(0, 50) + '...' : cmd}`;
            } else if (item.name === 'edit_file' && toolInput && typeof toolInput === 'object' && 'path' in toolInput) {
              const path = toolInput.path as string;
              inputSummary = ` → ${path.split('/').slice(-2).join('/')}`;
            } else if (item.name === 'create_file' && toolInput && typeof toolInput === 'object' && 'path' in toolInput) {
              const path = toolInput.path as string;
              inputSummary = ` → ${path.split('/').slice(-2).join('/')}`;
            } else if (item.name === 'Grep' && toolInput && typeof toolInput === 'object' && 'pattern' in toolInput) {
              const pattern = toolInput.pattern as string;
              inputSummary = ` → "${pattern}"`;
            }
            
            parts.push(`🔧 ${item.name}${inputSummary}`);
          }
        }
        
        // Add token usage if available
        if (msg.message.usage) {
          const { input_tokens, output_tokens } = msg.message.usage;
          if (input_tokens || output_tokens) {
            parts.push(`   [${input_tokens || 0} in / ${output_tokens || 0} out tokens]`);
          }
        }
        
        return parts.join('\n');
      }
      return `🤖 Assistant response`;

    case 'result':
      if (msg.is_error) {
        return `❌ Error: ${msg.result || 'Unknown error'}`;
      }
      const duration = msg.duration_ms ? ` (${(msg.duration_ms / 1000).toFixed(1)}s)` : '';
      if (msg.result && msg.result.length > 200) {
        return `✅ Complete${duration}: ${msg.result.substring(0, 200)}...`;
      }
      return `✅ Complete${duration}${msg.result ? `: ${msg.result}` : ''}`;

    default:
      return `[${msg.type}] ${JSON.stringify(msg).substring(0, 100)}...`;
  }
}

function formatClaudeMessage(msg: ClaudeStreamMessage): string {
  // Claude Code stream-json format
  if (msg.type === 'message' && msg.message) {
    return `💬 ${msg.message}`;
  }
  
  if (msg.type === 'tool_use' && msg.tool_name) {
    return `🔧 ${msg.tool_name}`;
  }
  
  if (msg.type === 'tool_result') {
    return `📎 Tool result`;
  }
  
  if (msg.type === 'error' && msg.error) {
    return `❌ ${msg.error}`;
  }
  
  if (msg.result) {
    return `✅ ${msg.result}`;
  }
  
  return JSON.stringify(msg).substring(0, 150);
}
