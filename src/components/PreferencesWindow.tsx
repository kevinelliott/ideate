import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { defaultPlugins, type AgentPlugin } from "../types";
import { useModalKeyboard } from "../hooks/useModalKeyboard";
import { useThemeStore, type Theme } from "../stores/themeStore";

export type AutonomyLevel = "autonomous" | "pause-between" | "manual";

interface AgentCliPath {
  agentId: string;
  path: string;
}

interface Preferences {
  defaultAgent: string | null;
  defaultAutonomy: AutonomyLevel;
  logBufferSize: number;
  agentPaths: AgentCliPath[];
  theme: Theme;
}

interface PreferencesWindowProps {
  isOpen: boolean;
  onClose: () => void;
}

const autonomyOptions: { value: AutonomyLevel; label: string }[] = [
  { value: "autonomous", label: "Fully Autonomous" },
  { value: "pause-between", label: "Pause Between Stories" },
  { value: "manual", label: "Manual Per Story" },
];

const themeOptions: { value: Theme; label: string }[] = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

const defaultPreferences: Preferences = {
  defaultAgent: null,
  defaultAutonomy: "pause-between",
  logBufferSize: 1000,
  agentPaths: [],
  theme: "system",
};

export function PreferencesWindow({ isOpen, onClose }: PreferencesWindowProps) {
  const [preferences, setPreferences] = useState<Preferences>(defaultPreferences);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const setTheme = useThemeStore((state) => state.setTheme);

  useModalKeyboard(isOpen, onClose);

  useEffect(() => {
    if (isOpen) {
      loadPreferences();
    }
  }, [isOpen]);

  const loadPreferences = async () => {
    setIsLoading(true);
    try {
      const prefs = await invoke<Preferences>("load_preferences");
      setPreferences({ ...defaultPreferences, ...prefs });
    } catch (err) {
      console.error("Failed to load preferences:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const savePreferences = async (newPrefs: Preferences) => {
    setIsSaving(true);
    try {
      await invoke("save_preferences", { preferences: newPrefs });
      setPreferences(newPrefs);
    } catch (err) {
      console.error("Failed to save preferences:", err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDefaultAgentChange = (agentId: string) => {
    const newPrefs = { ...preferences, defaultAgent: agentId || null };
    savePreferences(newPrefs);
  };

  const handleAutonomyChange = (autonomy: AutonomyLevel) => {
    const newPrefs = { ...preferences, defaultAutonomy: autonomy };
    savePreferences(newPrefs);
  };

  const handleLogBufferSizeChange = (size: number) => {
    const newPrefs = { ...preferences, logBufferSize: size };
    savePreferences(newPrefs);
  };

  const handleThemeChange = (theme: Theme) => {
    const newPrefs = { ...preferences, theme };
    savePreferences(newPrefs);
    setTheme(theme);
  };

  const handleAgentPathChange = (agentId: string, path: string) => {
    const existingPaths = preferences.agentPaths.filter((p) => p.agentId !== agentId);
    const newPaths = path ? [...existingPaths, { agentId, path }] : existingPaths;
    const newPrefs = { ...preferences, agentPaths: newPaths };
    savePreferences(newPrefs);
  };

  const getAgentPath = (agentId: string): string => {
    const found = preferences.agentPaths.find((p) => p.agentId === agentId);
    return found?.path || "";
  };

  if (!isOpen) return null;

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
      onClick={handleOverlayClick}
    >
      <div className="bg-card rounded-xl shadow-2xl w-full max-w-lg p-6 no-drag max-h-[80vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold">Preferences</h2>
          <button
            onClick={onClose}
            className="text-secondary hover:text-foreground transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {isLoading ? (
          <div className="py-8 text-center text-secondary">Loading preferences...</div>
        ) : (
          <div className="space-y-6">
            <section>
              <h3 className="text-sm font-medium text-foreground mb-3">Appearance</h3>
              <div className="space-y-4 bg-background rounded-lg p-4 border border-border">
                <div>
                  <label
                    htmlFor="theme-select"
                    className="block text-sm font-medium text-foreground mb-1.5"
                  >
                    Theme
                  </label>
                  <select
                    id="theme-select"
                    value={preferences.theme}
                    onChange={(e) => handleThemeChange(e.target.value as Theme)}
                    disabled={isSaving}
                    className="w-full px-3 py-2 bg-card border border-border rounded-lg text-foreground text-sm focus:ring-2 focus:ring-accent focus:border-transparent transition-all disabled:opacity-50"
                  >
                    {themeOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <p className="mt-1.5 text-xs text-secondary">
                    Choose between light, dark, or follow system preference
                  </p>
                </div>
              </div>
            </section>

            <section>
              <h3 className="text-sm font-medium text-foreground mb-3">Default Settings</h3>
              <div className="space-y-4 bg-background rounded-lg p-4 border border-border">
                <div>
                  <label
                    htmlFor="default-agent-select"
                    className="block text-sm font-medium text-foreground mb-1.5"
                  >
                    Default AI Agent
                  </label>
                  <select
                    id="default-agent-select"
                    value={preferences.defaultAgent || ""}
                    onChange={(e) => handleDefaultAgentChange(e.target.value)}
                    disabled={isSaving}
                    className="w-full px-3 py-2 bg-card border border-border rounded-lg text-foreground text-sm focus:ring-2 focus:ring-accent focus:border-transparent transition-all disabled:opacity-50"
                  >
                    <option value="">No default (choose per project)</option>
                    {defaultPlugins.map((plugin: AgentPlugin) => (
                      <option key={plugin.id} value={plugin.id}>
                        {plugin.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="default-autonomy-select"
                    className="block text-sm font-medium text-foreground mb-1.5"
                  >
                    Default Autonomy Level
                  </label>
                  <select
                    id="default-autonomy-select"
                    value={preferences.defaultAutonomy}
                    onChange={(e) => handleAutonomyChange(e.target.value as AutonomyLevel)}
                    disabled={isSaving}
                    className="w-full px-3 py-2 bg-card border border-border rounded-lg text-foreground text-sm focus:ring-2 focus:ring-accent focus:border-transparent transition-all disabled:opacity-50"
                  >
                    {autonomyOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <p className="mt-1.5 text-xs text-secondary">
                    Applied to new projects
                  </p>
                </div>

                <div>
                  <label
                    htmlFor="log-buffer-size"
                    className="block text-sm font-medium text-foreground mb-1.5"
                  >
                    Log Buffer Size
                  </label>
                  <input
                    id="log-buffer-size"
                    type="number"
                    min={100}
                    max={10000}
                    step={100}
                    value={preferences.logBufferSize}
                    onChange={(e) => handleLogBufferSizeChange(parseInt(e.target.value, 10) || 1000)}
                    disabled={isSaving}
                    className="w-full px-3 py-2 bg-card border border-border rounded-lg text-foreground text-sm focus:ring-2 focus:ring-accent focus:border-transparent transition-all disabled:opacity-50"
                  />
                  <p className="mt-1.5 text-xs text-secondary">
                    Maximum number of log lines to keep in memory (100-10000)
                  </p>
                </div>
              </div>
            </section>

            <section>
              <h3 className="text-sm font-medium text-foreground mb-3">Agent CLI Paths</h3>
              <p className="text-xs text-secondary mb-3">
                Customize the executable path for each agent. Leave blank to use the default command.
              </p>
              <div className="space-y-3 bg-background rounded-lg p-4 border border-border">
                {defaultPlugins.map((plugin: AgentPlugin) => (
                  <div key={plugin.id}>
                    <label
                      htmlFor={`agent-path-${plugin.id}`}
                      className="block text-sm font-medium text-foreground mb-1.5"
                    >
                      {plugin.name}
                    </label>
                    <input
                      id={`agent-path-${plugin.id}`}
                      type="text"
                      value={getAgentPath(plugin.id)}
                      onChange={(e) => handleAgentPathChange(plugin.id, e.target.value)}
                      placeholder={plugin.command}
                      disabled={isSaving}
                      className="w-full px-3 py-2 bg-card border border-border rounded-lg text-foreground text-sm placeholder:text-secondary/60 focus:ring-2 focus:ring-accent focus:border-transparent transition-all disabled:opacity-50"
                    />
                  </div>
                ))}
              </div>
            </section>
          </div>
        )}

        <div className="flex justify-end mt-6">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-accent text-white font-medium hover:opacity-90 transition-opacity"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
