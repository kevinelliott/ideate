import { useModalKeyboard } from "../hooks/useModalKeyboard";

interface KeyboardShortcutsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface ShortcutItem {
  keys: string;
  description: string;
}

interface ShortcutCategory {
  title: string;
  shortcuts: ShortcutItem[];
}

const shortcutCategories: ShortcutCategory[] = [
  {
    title: "General",
    shortcuts: [
      { keys: "⌘ + K", description: "Command Palette" },
      { keys: "⌘ + ,", description: "Open Settings" },
      { keys: "⌘ + /", description: "Toggle Keyboard Shortcuts" },
      { keys: "⌘ + N", description: "New Project" },
      { keys: "⌘ + I", description: "Import Project" },
      { keys: "Escape", description: "Close modal / Cancel" },
    ],
  },
  {
    title: "Navigation",
    shortcuts: [
      { keys: "⌘ + 1-9", description: "Switch to project by index" },
      { keys: "↑ / ↓", description: "Navigate stories" },
    ],
  },
  {
    title: "Panels",
    shortcuts: [
      { keys: "⌘ + L", description: "Toggle Log Panel" },
      { keys: "⌘ + T", description: "Toggle Terminal Panel" },
      { keys: "⌘ + J", description: "Toggle Sidekick Assistant" },
      { keys: "⌘ + \\", description: "Toggle Preview Panel" },
    ],
  },
  {
    title: "Build",
    shortcuts: [
      { keys: "⌘ + Enter", description: "Start/Resume build" },
      { keys: "⌘ + P", description: "Pause build" },
      { keys: "⌘ + .", description: "Stop build" },
    ],
  },
];

export function KeyboardShortcutsModal({ isOpen, onClose }: KeyboardShortcutsModalProps) {
  useModalKeyboard(isOpen, onClose);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-card rounded-xl shadow-2xl w-full max-w-md overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-border">
          <h1 className="text-lg font-semibold text-foreground">Keyboard Shortcuts</h1>
        </div>

        {/* Content */}
        <div className="px-6 py-4 space-y-5 max-h-[60vh] overflow-y-auto">
          {shortcutCategories.map((category) => (
            <div key={category.title}>
              <h2 className="text-xs font-medium text-muted uppercase tracking-wider mb-2">
                {category.title}
              </h2>
              <div className="space-y-1.5">
                {category.shortcuts.map((shortcut) => (
                  <div
                    key={shortcut.keys}
                    className="flex items-center justify-between py-1"
                  >
                    <span className="text-sm text-secondary">{shortcut.description}</span>
                    <kbd className="px-2 py-0.5 text-xs font-mono bg-background-secondary text-foreground rounded border border-border">
                      {shortcut.keys}
                    </kbd>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-border bg-background-secondary">
          <button
            onClick={onClose}
            className="w-full px-4 py-2 rounded-lg bg-accent text-white font-medium hover:opacity-90 transition-opacity"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
