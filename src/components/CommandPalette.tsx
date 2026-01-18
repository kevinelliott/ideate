import { useState, useEffect, useCallback, useRef } from "react";
import { useModalKeyboard } from "../hooks/useModalKeyboard";
import { useProjectStore } from "../stores/projectStore";
import { useBuildStore } from "../stores/buildStore";
import { usePanelStore } from "../stores/panelStore";
import { useTheme } from "../hooks/useTheme";
import { useBuildLoop } from "../hooks/useBuildLoop";
import { usePrdStore } from "../stores/prdStore";

interface Command {
  id: string;
  name: string;
  shortcut?: string;
  category: string;
  action: () => void;
  disabled?: boolean;
}

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  onNewProject: () => void;
  onImportProject: () => void;
}

export function CommandPalette({
  isOpen,
  onClose,
  onNewProject,
  onImportProject,
}: CommandPaletteProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const activeProjectId = useProjectStore((state) => state.activeProjectId);
  const activeProject = useProjectStore((state) =>
    state.projects.find((p) => p.id === state.activeProjectId)
  );

  const projectState = useBuildStore((state) =>
    activeProjectId ? state.projectStates[activeProjectId] : null
  );
  const buildStatus = projectState?.status ?? "idle";
  const pauseBuild = useBuildStore((state) => state.pauseBuild);

  const toggleLogPanel = usePanelStore((state) => state.toggleLogPanel);
  const toggleTerminalPanel = usePanelStore((state) => state.toggleTerminalPanel);
  const toggleAgentPanel = usePanelStore((state) => state.toggleAgentPanel);
  const togglePreviewPanel = usePanelStore((state) => state.togglePreviewPanel);

  const { toggleTheme, colorMode } = useTheme();

  const projectPrd = usePrdStore((state) => activeProjectId ? state.projectPrds[activeProjectId] : null);
  const stories = projectPrd?.stories ?? [];
  const hasIncompleteStories = stories.some((s) => !s.passes);
  const hasStories = stories.length > 0;

  const { handleStart, handleResume, handleCancel } = useBuildLoop(
    activeProjectId || "",
    activeProject?.path || ""
  );

  const commands: Command[] = [
    {
      id: "new-project",
      name: "New Project",
      category: "Projects",
      action: () => {
        onNewProject();
        onClose();
      },
    },
    {
      id: "import-project",
      name: "Import Project",
      category: "Projects",
      action: () => {
        onImportProject();
        onClose();
      },
    },
    {
      id: "open-settings",
      name: "Open Settings",
      shortcut: "⌘ ,",
      category: "General",
      action: () => {
        window.dispatchEvent(new CustomEvent("open-settings"));
        onClose();
      },
    },
    {
      id: "toggle-log-panel",
      name: "Toggle Log Panel",
      shortcut: "⌘ L",
      category: "Panels",
      disabled: !activeProjectId,
      action: () => {
        if (activeProjectId) {
          toggleLogPanel(activeProjectId);
          onClose();
        }
      },
    },
    {
      id: "toggle-terminal-panel",
      name: "Toggle Terminal Panel",
      shortcut: "⌘ T",
      category: "Panels",
      disabled: !activeProjectId,
      action: () => {
        if (activeProjectId) {
          toggleTerminalPanel(activeProjectId);
          onClose();
        }
      },
    },
    {
      id: "toggle-preview-panel",
      name: "Toggle Preview Panel",
      shortcut: "⌘ \\",
      category: "Panels",
      disabled: !activeProjectId,
      action: () => {
        if (activeProjectId) {
          togglePreviewPanel(activeProjectId);
          onClose();
        }
      },
    },
    {
      id: "toggle-agent-panel",
      name: "Toggle Agent Panel",
      shortcut: "⌘ J",
      category: "Panels",
      disabled: !activeProjectId,
      action: () => {
        if (activeProjectId) {
          toggleAgentPanel(activeProjectId);
          onClose();
        }
      },
    },
    {
      id: "start-build",
      name: "Start Build",
      category: "Build",
      disabled: !activeProjectId || buildStatus !== "idle" || !hasStories || !hasIncompleteStories,
      action: () => {
        if (activeProjectId && buildStatus === "idle") {
          handleStart();
          onClose();
        }
      },
    },
    {
      id: "pause-build",
      name: "Pause Build",
      category: "Build",
      disabled: !activeProjectId || buildStatus !== "running",
      action: () => {
        if (activeProjectId && buildStatus === "running") {
          pauseBuild(activeProjectId);
          onClose();
        }
      },
    },
    {
      id: "resume-build",
      name: "Resume Build",
      category: "Build",
      disabled: !activeProjectId || buildStatus !== "paused",
      action: () => {
        if (activeProjectId && buildStatus === "paused") {
          handleResume();
          onClose();
        }
      },
    },
    {
      id: "cancel-build",
      name: "Cancel Build",
      category: "Build",
      disabled: !activeProjectId || buildStatus === "idle",
      action: () => {
        if (activeProjectId && buildStatus !== "idle") {
          handleCancel();
          onClose();
        }
      },
    },
    {
      id: "toggle-theme",
      name: `Toggle Theme (${colorMode})`,
      category: "Appearance",
      action: () => {
        toggleTheme();
        onClose();
      },
    },
    {
      id: "story-manager",
      name: "Story Manager",
      shortcut: "⇧ ⌘ M",
      category: "Advanced",
      disabled: !activeProjectId,
      action: () => {
        window.dispatchEvent(new CustomEvent("open-story-manager"));
        onClose();
      },
    },
  ];

  const filteredCommands = commands.filter((cmd) => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      cmd.name.toLowerCase().includes(query) ||
      cmd.category.toLowerCase().includes(query)
    );
  });

  const groupedCommands = filteredCommands.reduce(
    (acc, cmd) => {
      if (!acc[cmd.category]) {
        acc[cmd.category] = [];
      }
      acc[cmd.category].push(cmd);
      return acc;
    },
    {} as Record<string, Command[]>
  );

  const flatFilteredCommands = filteredCommands;

  useEffect(() => {
    if (isOpen) {
      setSearchQuery("");
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [isOpen]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [searchQuery]);

  const executeCommand = useCallback(
    (command: Command) => {
      if (!command.disabled) {
        command.action();
      }
    },
    []
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((prev) =>
          prev < flatFilteredCommands.length - 1 ? prev + 1 : 0
        );
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((prev) =>
          prev > 0 ? prev - 1 : flatFilteredCommands.length - 1
        );
      } else if (e.key === "Enter") {
        e.preventDefault();
        const selected = flatFilteredCommands[selectedIndex];
        if (selected) {
          executeCommand(selected);
        }
      }
    },
    [flatFilteredCommands, selectedIndex, executeCommand]
  );

  useEffect(() => {
    const selectedElement = listRef.current?.querySelector(
      `[data-index="${selectedIndex}"]`
    );
    selectedElement?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex]);

  useModalKeyboard(isOpen, onClose);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-start justify-center z-50 pt-[15vh]"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div className="bg-card rounded-xl shadow-2xl w-full max-w-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-border">
          <div className="flex items-center gap-3">
            <svg
              className="w-5 h-5 text-muted"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
            <input
              ref={inputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type a command or search..."
              className="flex-1 bg-transparent text-foreground placeholder:text-muted outline-none"
            />
            <kbd className="px-2 py-0.5 text-xs font-mono bg-background-secondary text-muted rounded border border-border">
              esc
            </kbd>
          </div>
        </div>

        <div
          ref={listRef}
          className="max-h-[50vh] overflow-y-auto py-2"
        >
          {Object.keys(groupedCommands).length === 0 ? (
            <div className="px-4 py-8 text-center text-muted">
              No commands found
            </div>
          ) : (
            Object.entries(groupedCommands).map(([category, cmds]) => (
              <div key={category}>
                <div className="px-4 py-1.5 text-xs font-medium text-muted uppercase tracking-wider">
                  {category}
                </div>
                {cmds.map((cmd) => {
                  const globalIndex = flatFilteredCommands.indexOf(cmd);
                  return (
                    <button
                      key={cmd.id}
                      data-index={globalIndex}
                      onClick={() => executeCommand(cmd)}
                      disabled={cmd.disabled}
                      className={`w-full px-4 py-2 flex items-center justify-between text-left transition-colors ${
                        globalIndex === selectedIndex
                          ? "bg-accent/10"
                          : "hover:bg-background-secondary"
                      } ${cmd.disabled ? "opacity-40 cursor-not-allowed" : ""}`}
                    >
                      <span className="text-sm text-foreground">{cmd.name}</span>
                      {cmd.shortcut && (
                        <kbd className="px-2 py-0.5 text-xs font-mono bg-background-secondary text-muted rounded border border-border">
                          {cmd.shortcut}
                        </kbd>
                      )}
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
