import type { ITheme } from "@xterm/xterm";

export const darkTerminalTheme: ITheme = {
  background: "#0a0a0a",
  foreground: "#a1a1aa",
  cursor: "#22c55e",
  cursorAccent: "#0a0a0a",
  selectionBackground: "#262626",
  black: "#0a0a0a",
  red: "#ef4444",
  green: "#22c55e",
  yellow: "#f59e0b",
  blue: "#3b82f6",
  magenta: "#a855f7",
  cyan: "#06b6d4",
  white: "#e4e4e7",
  brightBlack: "#71717a",
  brightRed: "#ef4444",
  brightGreen: "#4ade80",
  brightYellow: "#fbbf24",
  brightBlue: "#60a5fa",
  brightMagenta: "#c084fc",
  brightCyan: "#22d3ee",
  brightWhite: "#ffffff",
};

export const lightTerminalTheme: ITheme = {
  background: "#ffffff",
  foreground: "#0a0a0a",
  cursor: "#16a34a",
  cursorAccent: "#ffffff",
  selectionBackground: "#e4e4e7",
  black: "#09090b",
  red: "#dc2626",
  green: "#16a34a",
  yellow: "#ca8a04",
  blue: "#2563eb",
  magenta: "#9333ea",
  cyan: "#0891b2",
  white: "#ffffff",
  brightBlack: "#71717a",
  brightRed: "#ef4444",
  brightGreen: "#22c55e",
  brightYellow: "#eab308",
  brightBlue: "#3b82f6",
  brightMagenta: "#a855f7",
  brightCyan: "#06b6d4",
  brightWhite: "#ffffff",
};

export function getTerminalTheme(resolvedTheme: "light" | "dark"): ITheme {
  return resolvedTheme === "light" ? lightTerminalTheme : darkTerminalTheme;
}
