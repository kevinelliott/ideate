import { useMemo } from "react";

interface CodeViewerProps {
  content: string;
  fileName: string;
}

type TokenType = "keyword" | "string" | "comment" | "number" | "function" | "type" | "property" | "operator" | "default";

interface Token {
  type: TokenType;
  text: string;
}

const KEYWORDS_JS = new Set([
  "async", "await", "break", "case", "catch", "class", "const", "continue",
  "debugger", "default", "delete", "do", "else", "export", "extends", "finally",
  "for", "from", "function", "if", "import", "in", "instanceof", "let", "new",
  "of", "return", "static", "super", "switch", "this", "throw", "try", "typeof",
  "var", "void", "while", "with", "yield", "true", "false", "null", "undefined"
]);

const KEYWORDS_RUST = new Set([
  "as", "async", "await", "break", "const", "continue", "crate", "dyn", "else",
  "enum", "extern", "false", "fn", "for", "if", "impl", "in", "let", "loop",
  "match", "mod", "move", "mut", "pub", "ref", "return", "self", "Self", "static",
  "struct", "super", "trait", "true", "type", "unsafe", "use", "where", "while"
]);

const TYPE_KEYWORDS = new Set([
  "string", "number", "boolean", "any", "void", "never", "unknown", "object",
  "String", "Number", "Boolean", "Array", "Object", "Promise", "Map", "Set",
  "i8", "i16", "i32", "i64", "i128", "isize", "u8", "u16", "u32", "u64", "u128",
  "usize", "f32", "f64", "bool", "char", "str", "Vec", "Option", "Result"
]);

function getLanguage(fileName: string): string {
  const ext = fileName.split(".").pop()?.toLowerCase() || "";
  const langMap: Record<string, string> = {
    ts: "typescript", tsx: "typescript", js: "javascript", jsx: "javascript",
    rs: "rust", py: "python", json: "json", css: "css", scss: "css",
    html: "html", md: "markdown", yaml: "yaml", yml: "yaml", toml: "toml",
    sh: "bash", bash: "bash", zsh: "bash", go: "go", rb: "ruby", sql: "sql"
  };
  return langMap[ext] || "text";
}

function tokenizeLine(line: string, lang: string): Token[] {
  const tokens: Token[] = [];
  let remaining = line;
  
  const keywords = lang === "rust" ? KEYWORDS_RUST : KEYWORDS_JS;
  
  while (remaining.length > 0) {
    if (lang === "json") {
      const stringMatch = remaining.match(/^"(?:[^"\\]|\\.)*"/);
      if (stringMatch) {
        tokens.push({ type: "string", text: stringMatch[0] });
        remaining = remaining.slice(stringMatch[0].length);
        continue;
      }
      const numMatch = remaining.match(/^-?\d+(\.\d+)?/);
      if (numMatch) {
        tokens.push({ type: "number", text: numMatch[0] });
        remaining = remaining.slice(numMatch[0].length);
        continue;
      }
      const boolMatch = remaining.match(/^(true|false|null)/);
      if (boolMatch) {
        tokens.push({ type: "keyword", text: boolMatch[0] });
        remaining = remaining.slice(boolMatch[0].length);
        continue;
      }
    }

    const commentMatch = remaining.match(/^(\/\/.*|#.*|\/\*.*?\*\/)/);
    if (commentMatch) {
      tokens.push({ type: "comment", text: commentMatch[0] });
      remaining = remaining.slice(commentMatch[0].length);
      continue;
    }

    const stringMatch = remaining.match(/^(['"`])(?:[^\\]|\\.)*?\1/);
    if (stringMatch) {
      tokens.push({ type: "string", text: stringMatch[0] });
      remaining = remaining.slice(stringMatch[0].length);
      continue;
    }

    const templateMatch = remaining.match(/^`[^`]*`/);
    if (templateMatch) {
      tokens.push({ type: "string", text: templateMatch[0] });
      remaining = remaining.slice(templateMatch[0].length);
      continue;
    }

    const wordMatch = remaining.match(/^[a-zA-Z_$][a-zA-Z0-9_$]*/);
    if (wordMatch) {
      const word = wordMatch[0];
      let type: TokenType = "default";
      if (keywords.has(word)) {
        type = "keyword";
      } else if (TYPE_KEYWORDS.has(word)) {
        type = "type";
      } else if (remaining.slice(word.length).match(/^\s*[(<]/)) {
        type = "function";
      } else if (word[0] === word[0].toUpperCase() && word[0] !== word[0].toLowerCase()) {
        type = "type";
      }
      tokens.push({ type, text: word });
      remaining = remaining.slice(word.length);
      continue;
    }

    const numMatch = remaining.match(/^0x[0-9a-fA-F]+|^\d+(\.\d+)?([eE][+-]?\d+)?/);
    if (numMatch) {
      tokens.push({ type: "number", text: numMatch[0] });
      remaining = remaining.slice(numMatch[0].length);
      continue;
    }

    const opMatch = remaining.match(/^(=>|->|::|\.\.\.|&&|\|\||[+\-*/%=<>!&|^~?:;,.[\]{}()])/);
    if (opMatch) {
      tokens.push({ type: "operator", text: opMatch[0] });
      remaining = remaining.slice(opMatch[0].length);
      continue;
    }

    tokens.push({ type: "default", text: remaining[0] });
    remaining = remaining.slice(1);
  }
  
  return tokens;
}

function TokenSpan({ token }: { token: Token }) {
  const classMap: Record<TokenType, string> = {
    keyword: "text-purple-400",
    string: "text-green-400",
    comment: "text-gray-500 italic",
    number: "text-orange-400",
    function: "text-blue-400",
    type: "text-cyan-400",
    property: "text-foreground",
    operator: "text-gray-400",
    default: "text-foreground"
  };
  
  return <span className={classMap[token.type]}>{token.text}</span>;
}

export function CodeViewer({ content, fileName }: CodeViewerProps) {
  const lang = getLanguage(fileName);
  
  const lines = useMemo(() => {
    return content.split("\n").map((line, i) => ({
      number: i + 1,
      tokens: tokenizeLine(line, lang)
    }));
  }, [content, lang]);

  return (
    <div className="h-full overflow-auto bg-background font-mono text-xs">
      <div className="min-w-max">
        {lines.map((line) => (
          <div key={line.number} className="flex hover:bg-card/30">
            <span className="w-12 flex-shrink-0 text-right pr-3 text-muted select-none border-r border-border bg-background-secondary">
              {line.number}
            </span>
            <pre className="flex-1 pl-3 whitespace-pre">
              {line.tokens.length === 0 ? " " : line.tokens.map((token, i) => (
                <TokenSpan key={i} token={token} />
              ))}
            </pre>
          </div>
        ))}
      </div>
    </div>
  );
}
