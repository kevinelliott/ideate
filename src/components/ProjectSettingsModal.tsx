import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useModalKeyboard } from "../hooks/useModalKeyboard";
import { defaultPlugins, type AgentPlugin } from "../types";

export type AutonomyLevel = "autonomous" | "pause-between" | "manual";
export type BuildMode = "ralph" | "parallel" | "none";

interface ProjectSettings {
  agent: string | null;
  autonomy: AutonomyLevel;
  buildMode: BuildMode | null;
}

interface Preferences {
  defaultAgent: string | null;
  defaultAutonomy: string;
  defaultBuildMode: string;
}

interface ProjectSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectId: string;
  projectPath: string;
  projectName: string;
}

const autonomyOptions: { value: AutonomyLevel; label: string; description: string }[] = [
  { value: "autonomous", label: "Autonomous", description: "Runs without user intervention" },
  { value: "pause-between", label: "Pause Between Stories", description: "Pauses after each story completes" },
  { value: "manual", label: "Manual", description: "Requires manual start for each story" },
];

const buildModeOptions: { value: BuildMode; label: string; description: string }[] = [
  { value: "ralph", label: "Ralph (Sequential)", description: "Execute stories one at a time in order" },
  { value: "parallel", label: "Parallel", description: "Run multiple stories concurrently" },
  { value: "none", label: "None", description: "No automatic building" },
];

function SettingsIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  );
}

export function ProjectSettingsModal({ 
  isOpen, 
  onClose, 
  projectId, 
  projectPath, 
  projectName 
}: ProjectSettingsModalProps) {
  const [selectedAgent, setSelectedAgent] = useState<string>("");
  const [autonomyLevel, setAutonomyLevel] = useState<AutonomyLevel>("autonomous");
  const [buildMode, setBuildMode] = useState<BuildMode>("ralph");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [originalSettings, setOriginalSettings] = useState<{
    agent: string;
    autonomy: AutonomyLevel;
    buildMode: BuildMode;
  } | null>(null);

  useModalKeyboard(isOpen, onClose);

  useEffect(() => {
    if (!isOpen) return;

    let cancelled = false;

    async function loadSettings() {
      setIsLoading(true);
      try {
        const [settings, prefs] = await Promise.all([
          invoke<ProjectSettings | null>("load_project_settings", { projectPath }),
          invoke<Preferences | null>("load_preferences"),
        ]);

        if (!cancelled) {
          const defaultAgent = prefs?.defaultAgent || "";
          const defaultAutonomy = (prefs?.defaultAutonomy as AutonomyLevel) || "autonomous";
          const defaultBuildMode = (prefs?.defaultBuildMode as BuildMode) || "ralph";

          const agent = settings?.agent || defaultAgent;
          const autonomy = settings?.autonomy || defaultAutonomy;
          const mode = settings?.buildMode || defaultBuildMode;

          setSelectedAgent(agent);
          setAutonomyLevel(autonomy);
          setBuildMode(mode);
          setOriginalSettings({ agent, autonomy, buildMode: mode });
          setHasChanges(false);
        }
      } catch (err) {
        console.error("Failed to load project settings:", err);
        if (!cancelled) {
          setSelectedAgent("");
          setAutonomyLevel("autonomous");
          setBuildMode("ralph");
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    loadSettings();

    return () => {
      cancelled = true;
    };
  }, [isOpen, projectPath]);

  useEffect(() => {
    if (originalSettings) {
      const changed =
        selectedAgent !== originalSettings.agent ||
        autonomyLevel !== originalSettings.autonomy ||
        buildMode !== originalSettings.buildMode;
      setHasChanges(changed);
    }
  }, [selectedAgent, autonomyLevel, buildMode, originalSettings]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await invoke("save_project_settings", {
        projectPath,
        settings: {
          agent: selectedAgent || null,
          autonomy: autonomyLevel,
          buildMode: buildMode,
        },
      });
      
      // Notify other components that settings have changed
      window.dispatchEvent(new CustomEvent("project-settings-changed", {
        detail: { projectId, projectPath }
      }));
      
      setOriginalSettings({ agent: selectedAgent, autonomy: autonomyLevel, buildMode });
      setHasChanges(false);
      onClose();
    } catch (err) {
      console.error("Failed to save project settings:", err);
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-card rounded-xl shadow-2xl w-full max-w-lg overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-accent/15 border border-accent/20 flex items-center justify-center text-accent">
              <SettingsIcon className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold">Project Settings</h2>
              <p className="text-xs text-muted truncate max-w-[280px]">{projectName}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-muted hover:text-foreground hover:bg-background transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <>
              {/* Agent Selection */}
              <div className="space-y-2">
                <label className="block text-sm font-medium text-foreground">
                  AI Agent
                </label>
                <p className="text-xs text-muted mb-2">
                  Select which AI coding agent to use for this project
                </p>
                <select
                  value={selectedAgent}
                  onChange={(e) => setSelectedAgent(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-background border border-border text-sm focus:outline-none focus:ring-2 focus:ring-accent/50"
                >
                  <option value="">No agent selected</option>
                  {defaultPlugins.map((plugin: AgentPlugin) => (
                    <option key={plugin.id} value={plugin.id}>
                      {plugin.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Build Mode */}
              <div className="space-y-2">
                <label className="block text-sm font-medium text-foreground">
                  Build Mode
                </label>
                <p className="text-xs text-muted mb-2">
                  How stories should be executed during builds
                </p>
                <div className="space-y-2">
                  {buildModeOptions.map((option) => (
                    <label
                      key={option.value}
                      className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                        buildMode === option.value
                          ? "border-accent bg-accent/5"
                          : "border-border hover:border-accent/50"
                      }`}
                    >
                      <input
                        type="radio"
                        name="buildMode"
                        value={option.value}
                        checked={buildMode === option.value}
                        onChange={(e) => setBuildMode(e.target.value as BuildMode)}
                        className="mt-0.5 accent-accent"
                      />
                      <div>
                        <div className="text-sm font-medium">{option.label}</div>
                        <div className="text-xs text-muted">{option.description}</div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              {/* Autonomy Level */}
              <div className="space-y-2">
                <label className="block text-sm font-medium text-foreground">
                  Autonomy Level
                </label>
                <p className="text-xs text-muted mb-2">
                  How much control you want during the build process
                </p>
                <div className="space-y-2">
                  {autonomyOptions.map((option) => (
                    <label
                      key={option.value}
                      className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                        autonomyLevel === option.value
                          ? "border-accent bg-accent/5"
                          : "border-border hover:border-accent/50"
                      }`}
                    >
                      <input
                        type="radio"
                        name="autonomy"
                        value={option.value}
                        checked={autonomyLevel === option.value}
                        onChange={(e) => setAutonomyLevel(e.target.value as AutonomyLevel)}
                        className="mt-0.5 accent-accent"
                      />
                      <div>
                        <div className="text-sm font-medium">{option.label}</div>
                        <div className="text-xs text-muted">{option.description}</div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-border bg-background/50">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm font-medium text-muted hover:text-foreground hover:bg-card transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!hasChanges || isSaving || isLoading}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              hasChanges && !isSaving && !isLoading
                ? "bg-accent text-white hover:bg-accent/90"
                : "bg-accent/50 text-white/70 cursor-not-allowed"
            }`}
          >
            {isSaving ? "Saving..." : "Save Changes"}
          </button>
        </div>
      </div>
    </div>
  );
}

export { SettingsIcon };
