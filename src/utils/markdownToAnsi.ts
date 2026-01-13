// ANSI escape codes for terminal formatting
const ANSI = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  italic: '\x1b[3m',
  underline: '\x1b[4m',
  // Colors
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  gray: '\x1b[90m',
}

// Regex to match ANSI escape sequences
const ANSI_REGEX = /\x1b\[[0-9;]*m/g

/**
 * Word-wrap text while preserving ANSI escape codes
 * Wraps at word boundaries to avoid cutting words in the middle
 */
export function wordWrap(text: string, maxWidth: number): string[] {
  if (maxWidth <= 0) return [text]
  
  const lines: string[] = []
  const words = text.split(/(\s+)/)
  
  let currentLine = ''
  let currentVisibleLength = 0
  let activeStyles = '' // Track active ANSI styles
  
  for (const word of words) {
    // Extract any ANSI codes from this word
    const codes = word.match(ANSI_REGEX) || []
    const visibleWord = word.replace(ANSI_REGEX, '')
    const wordVisibleLength = visibleWord.length
    
    // Update active styles based on codes in this word
    for (const code of codes) {
      if (code === ANSI.reset) {
        activeStyles = ''
      } else {
        activeStyles += code
      }
    }
    
    // Check if adding this word would exceed the width
    if (currentVisibleLength + wordVisibleLength > maxWidth && currentVisibleLength > 0) {
      // Start a new line, reset styles at end of current line
      if (activeStyles) {
        lines.push(currentLine + ANSI.reset)
        currentLine = activeStyles + word
      } else {
        lines.push(currentLine)
        currentLine = word
      }
      currentVisibleLength = wordVisibleLength
    } else {
      currentLine += word
      currentVisibleLength += wordVisibleLength
    }
  }
  
  // Add the last line
  if (currentLine) {
    lines.push(currentLine)
  }
  
  return lines
}

/**
 * Convert basic markdown to ANSI escape codes for terminal display
 */
export function markdownToAnsi(text: string): string {
  let result = text

  // Headers (# ## ### etc) - bold green
  result = result.replace(/^(#{1,6})\s+(.+)$/gm, (_, _hashes, content) => {
    return `${ANSI.bold}${ANSI.green}${content}${ANSI.reset}`
  })

  // Bold **text** or __text__
  result = result.replace(/\*\*(.+?)\*\*/g, `${ANSI.bold}$1${ANSI.reset}`)
  result = result.replace(/__(.+?)__/g, `${ANSI.bold}$1${ANSI.reset}`)

  // Italic *text* or _text_ (but not if it's part of a word like file_name)
  result = result.replace(/(?<![a-zA-Z0-9_])\*([^*\n]+?)\*(?![a-zA-Z0-9_])/g, `${ANSI.italic}$1${ANSI.reset}`)
  result = result.replace(/(?<![a-zA-Z0-9])_([^_\n]+?)_(?![a-zA-Z0-9])/g, `${ANSI.italic}$1${ANSI.reset}`)

  // Inline code `code`
  result = result.replace(/`([^`\n]+?)`/g, `${ANSI.cyan}$1${ANSI.reset}`)

  // Code blocks ```lang\ncode\n``` - cyan with dimmed delimiters
  result = result.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => {
    const trimmedCode = code.trimEnd()
    return `${ANSI.dim}───${lang ? ` ${lang} ` : ''}───${ANSI.reset}\n${ANSI.cyan}${trimmedCode}${ANSI.reset}\n${ANSI.dim}───────${ANSI.reset}`
  })

  // Bullet points - with colored bullet
  result = result.replace(/^(\s*)[-*]\s+/gm, `$1${ANSI.green}•${ANSI.reset} `)

  // Numbered lists - with colored number
  result = result.replace(/^(\s*)(\d+)\.\s+/gm, `$1${ANSI.green}$2.${ANSI.reset} `)

  // Blockquotes > text - gray with bar
  result = result.replace(/^>\s*(.*)$/gm, `${ANSI.gray}│ $1${ANSI.reset}`)

  // Horizontal rules --- or ***
  result = result.replace(/^([-*]){3,}\s*$/gm, `${ANSI.dim}────────────────────${ANSI.reset}`)

  // Links [text](url) - show text in blue, url in dim
  result = result.replace(/\[([^\]]+)\]\(([^)]+)\)/g, `${ANSI.blue}$1${ANSI.reset} ${ANSI.dim}($2)${ANSI.reset}`)

  // Strikethrough ~~text~~
  result = result.replace(/~~(.+?)~~/g, `${ANSI.dim}$1${ANSI.reset}`)

  return result
}

/**
 * Format a line of output for display, applying markdown formatting and word wrapping
 * Returns wrapped lines joined by newlines when terminalWidth is provided
 */
export function formatAgentOutput(line: string, terminalWidth?: number): string {
  const formatted = markdownToAnsi(line)
  
  if (terminalWidth && terminalWidth > 0) {
    const wrappedLines = wordWrap(formatted, terminalWidth)
    return wrappedLines.join('\n')
  }
  
  return formatted
}
