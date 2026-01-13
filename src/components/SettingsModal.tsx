import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useTheme, type Theme } from "../hooks/useTheme";
import { useModalKeyboard } from "../hooks/useModalKeyboard";
import { DEFAULT_PROMPTS, PROMPT_CATEGORIES, getPromptsByCategory, type PromptCategory } from "../utils/prompts";

interface Preferences {
  defaultAgent: string | null;
  defaultAutonomy: string;
  defaultBuildMode: string;
  logBufferSize: number;
  agentPaths: Array<{ agentId: string; path: string }>;
  theme: string;
  appIcon: string;
  promptOverrides: Record<string, string>;
}

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type SettingsTab = "general" | "prompts";
type AppIconVariant = "transparent" | "light" | "dark";

export function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  const { theme, setTheme } = useTheme();
  
  const [activeTab, setActiveTab] = useState<SettingsTab>("general");
  const [defaultAgent, setDefaultAgent] = useState<string>("amp");
  const [defaultAutonomy, setDefaultAutonomy] = useState<string>("autonomous");
  const [defaultBuildMode, setDefaultBuildMode] = useState<string>("ralph");
  const [logBufferSize, setLogBufferSize] = useState<number>(1000);
  const [appIcon, setAppIcon] = useState<AppIconVariant>("transparent");
  const [promptOverrides, setPromptOverrides] = useState<Record<string, string>>({});
  const [editingPromptId, setEditingPromptId] = useState<string | null>(null);
  const [editingPromptValue, setEditingPromptValue] = useState<string>("");
  const [_isDirty, setIsDirty] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [iconChanged, setIconChanged] = useState(false);

  useModalKeyboard(isOpen, onClose);

  useEffect(() => {
    if (isOpen) {
      loadPreferences();
      setActiveTab("general");
      setEditingPromptId(null);
      setIconChanged(false);
    }
  }, [isOpen]);

  const loadPreferences = async () => {
    try {
      const prefs = await invoke<Preferences | null>("load_preferences");
      if (prefs) {
        setDefaultAgent(prefs.defaultAgent || "amp");
        setDefaultAutonomy(prefs.defaultAutonomy || "autonomous");
        setDefaultBuildMode(prefs.defaultBuildMode || "ralph");
        setLogBufferSize(prefs.logBufferSize || 1000);
        setAppIcon((prefs.appIcon as AppIconVariant) || "transparent");
        setPromptOverrides(prefs.promptOverrides || {});
      }
      setIsDirty(false);
    } catch (error) {
      console.error("Failed to load preferences:", error);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const prefs: Preferences = {
        defaultAgent,
        defaultAutonomy,
        defaultBuildMode,
        logBufferSize,
        agentPaths: [],
        theme: theme,
        appIcon,
        promptOverrides,
      };
      await invoke("save_preferences", { preferences: prefs });
      setIsDirty(false);
      onClose();
    } catch (error) {
      console.error("Failed to save preferences:", error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    setIsDirty(false);
    onClose();
  };

  const handleThemeChange = (newTheme: Theme) => {
    setTheme(newTheme);
    setIsDirty(true);
  };

  const handleIconChange = (newIcon: AppIconVariant) => {
    if (newIcon !== appIcon) {
      setAppIcon(newIcon);
      setIconChanged(true);
      setIsDirty(true);
    }
  };

  const handleEditPrompt = (promptId: string) => {
    const override = promptOverrides[promptId];
    const defaultPrompt = DEFAULT_PROMPTS[promptId]?.defaultPrompt || "";
    setEditingPromptId(promptId);
    setEditingPromptValue(override || defaultPrompt);
  };

  const handleSavePrompt = () => {
    if (!editingPromptId) return;
    
    const defaultPrompt = DEFAULT_PROMPTS[editingPromptId]?.defaultPrompt || "";
    
    if (editingPromptValue === defaultPrompt) {
      const newOverrides = { ...promptOverrides };
      delete newOverrides[editingPromptId];
      setPromptOverrides(newOverrides);
    } else {
      setPromptOverrides({
        ...promptOverrides,
        [editingPromptId]: editingPromptValue,
      });
    }
    
    setIsDirty(true);
    setEditingPromptId(null);
    setEditingPromptValue("");
  };

  const handleResetPrompt = (promptId: string) => {
    const newOverrides = { ...promptOverrides };
    delete newOverrides[promptId];
    setPromptOverrides(newOverrides);
    setIsDirty(true);
    
    if (editingPromptId === promptId) {
      setEditingPromptValue(DEFAULT_PROMPTS[promptId]?.defaultPrompt || "");
    }
  };

  const handleCancelPromptEdit = () => {
    setEditingPromptId(null);
    setEditingPromptValue("");
  };

  const isPromptModified = (promptId: string) => {
    return promptId in promptOverrides;
  };

  if (!isOpen) return null;

  const promptsByCategory = getPromptsByCategory();

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-card rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="text-lg font-semibold">Settings</h2>
          <div className="flex gap-1">
            <button
              onClick={() => setActiveTab("general")}
              className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                activeTab === "general"
                  ? "bg-accent/10 text-accent"
                  : "text-secondary hover:text-foreground"
              }`}
            >
              General
            </button>
            <button
              onClick={() => setActiveTab("prompts")}
              className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                activeTab === "prompts"
                  ? "bg-accent/10 text-accent"
                  : "text-secondary hover:text-foreground"
              }`}
            >
              Prompts
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6 max-h-[60vh] overflow-y-auto scrollbar-auto-hide">
          {activeTab === "general" && (
            <>
              {/* Appearance Section */}
              <section>
                <h3 className="text-sm font-medium text-secondary uppercase tracking-wider mb-3">
                  Appearance
                </h3>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm text-foreground mb-2">Theme</label>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleThemeChange("light")}
                        className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg border transition-colors ${
                          theme === "light"
                            ? "border-accent bg-accent/10 text-accent"
                            : "border-border hover:border-secondary text-secondary hover:text-foreground"
                        }`}
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                        </svg>
                        <span className="text-sm">Light</span>
                      </button>
                      <button
                        onClick={() => handleThemeChange("dark")}
                        className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg border transition-colors ${
                          theme === "dark"
                            ? "border-accent bg-accent/10 text-accent"
                            : "border-border hover:border-secondary text-secondary hover:text-foreground"
                        }`}
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                        </svg>
                        <span className="text-sm">Dark</span>
                      </button>
                      <button
                        onClick={() => handleThemeChange("system")}
                        className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg border transition-colors ${
                          theme === "system"
                            ? "border-accent bg-accent/10 text-accent"
                            : "border-border hover:border-secondary text-secondary hover:text-foreground"
                        }`}
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                        </svg>
                        <span className="text-sm">System</span>
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm text-foreground mb-2">App Icon</label>
                    <div className="flex gap-3">
                      <button
                        onClick={() => handleIconChange("transparent")}
                        className={`flex flex-col items-center gap-2 p-3 rounded-lg border transition-colors ${
                          appIcon === "transparent"
                            ? "border-accent bg-accent/10"
                            : "border-border hover:border-secondary"
                        }`}
                      >
                        <div className="w-16 h-16 rounded-xl bg-gradient-to-br from-gray-100 to-gray-300 dark:from-gray-700 dark:to-gray-900 border border-border flex items-center justify-center overflow-hidden">
                          <img 
                            src="/icons/icon-transparent.png" 
                            alt="Transparent icon" 
                            className="w-12 h-12 object-contain"
                          />
                        </div>
                        <span className={`text-xs ${appIcon === "transparent" ? "text-accent" : "text-secondary"}`}>
                          Transparent
                        </span>
                      </button>
                      <button
                        onClick={() => handleIconChange("light")}
                        className={`flex flex-col items-center gap-2 p-3 rounded-lg border transition-colors ${
                          appIcon === "light"
                            ? "border-accent bg-accent/10"
                            : "border-border hover:border-secondary"
                        }`}
                      >
                        <div className="w-16 h-16 rounded-xl bg-white border border-border flex items-center justify-center overflow-hidden">
                          <img 
                            src="/icons/icon-light.png" 
                            alt="Light icon" 
                            className="w-12 h-12 object-contain"
                          />
                        </div>
                        <span className={`text-xs ${appIcon === "light" ? "text-accent" : "text-secondary"}`}>
                          Light
                        </span>
                      </button>
                      <button
                        onClick={() => handleIconChange("dark")}
                        className={`flex flex-col items-center gap-2 p-3 rounded-lg border transition-colors ${
                          appIcon === "dark"
                            ? "border-accent bg-accent/10"
                            : "border-border hover:border-secondary"
                        }`}
                      >
                        <div className="w-16 h-16 rounded-xl bg-[#1a1a1a] border border-border flex items-center justify-center overflow-hidden">
                          <img 
                            src="/icons/icon-dark.png" 
                            alt="Dark icon" 
                            className="w-12 h-12 object-contain"
                          />
                        </div>
                        <span className={`text-xs ${appIcon === "dark" ? "text-accent" : "text-secondary"}`}>
                          Dark
                        </span>
                      </button>
                    </div>
                    {iconChanged && (
                      <p className="text-xs text-muted mt-2">
                        Icon change applied. The dock icon will update shortly.
                      </p>
                    )}
                  </div>
                </div>
              </section>

              {/* Build Defaults Section */}
              <section>
                <h3 className="text-sm font-medium text-secondary uppercase tracking-wider mb-3">
                  Build Defaults
                </h3>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm text-foreground mb-2">Default Agent</label>
                    <select
                      value={defaultAgent}
                      onChange={(e) => {
                        setDefaultAgent(e.target.value);
                        setIsDirty(true);
                      }}
                      className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-accent"
                    >
                      <option value="amp">Amp</option>
                      <option value="claude-code">Claude Code</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm text-foreground mb-2">Default Autonomy Level</label>
                    <select
                      value={defaultAutonomy}
                      onChange={(e) => {
                        setDefaultAutonomy(e.target.value);
                        setIsDirty(true);
                      }}
                      className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-accent"
                    >
                      <option value="autonomous">Autonomous</option>
                      <option value="pause-between">Pause Between Stories</option>
                      <option value="manual">Manual</option>
                    </select>
                    <p className="text-xs text-muted mt-1">
                      {defaultAutonomy === "autonomous" && "Run all stories automatically without pausing."}
                      {defaultAutonomy === "pause-between" && "Pause after each story for review before continuing."}
                      {defaultAutonomy === "manual" && "Pause before each story and require manual start."}
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm text-foreground mb-2">Default Build Mode</label>
                    <select
                      value={defaultBuildMode}
                      onChange={(e) => {
                        setDefaultBuildMode(e.target.value);
                        setIsDirty(true);
                      }}
                      className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-accent"
                    >
                      <option value="ralph">Ralph</option>
                      <option value="parallel">Parallel</option>
                      <option value="none">None</option>
                    </select>
                    <p className="text-xs text-muted mt-1">
                      {defaultBuildMode === "ralph" && "Sequential story execution with Ralph agent system."}
                      {defaultBuildMode === "parallel" && "Run multiple stories concurrently."}
                      {defaultBuildMode === "none" && "No automatic building - manual story execution only."}
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm text-foreground mb-2">Log Buffer Size</label>
                    <input
                      type="number"
                      value={logBufferSize}
                      onChange={(e) => {
                        setLogBufferSize(parseInt(e.target.value) || 1000);
                        setIsDirty(true);
                      }}
                      min={100}
                      max={10000}
                      step={100}
                      className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-accent"
                    />
                    <p className="text-xs text-muted mt-1">
                      Maximum number of log entries to keep in memory.
                    </p>
                  </div>
                </div>
              </section>
            </>
          )}

          {activeTab === "prompts" && (
            <section>
              <p className="text-sm text-muted mb-4">
                Customize the prompts used by agents for various tasks. Click Edit to modify a prompt,
                or Reset to restore the default.
              </p>

              {editingPromptId ? (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-sm font-medium text-foreground">
                        {DEFAULT_PROMPTS[editingPromptId]?.name}
                      </h4>
                      <p className="text-xs text-muted">
                        {DEFAULT_PROMPTS[editingPromptId]?.description}
                      </p>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs text-secondary mb-2">
                      Available variables: {DEFAULT_PROMPTS[editingPromptId]?.variables.join(", ") || "None"}
                    </label>
                    <textarea
                      value={editingPromptValue}
                      onChange={(e) => setEditingPromptValue(e.target.value)}
                      className="w-full h-64 px-3 py-2 rounded-lg border border-border bg-background text-foreground font-mono text-xs focus:outline-none focus:ring-2 focus:ring-accent resize-none"
                      placeholder="Enter prompt..."
                    />
                  </div>

                  <div className="flex justify-between">
                    <button
                      onClick={() => handleResetPrompt(editingPromptId)}
                      className="px-3 py-1.5 text-sm text-muted hover:text-foreground transition-colors"
                    >
                      Reset to Default
                    </button>
                    <div className="flex gap-2">
                      <button
                        onClick={handleCancelPromptEdit}
                        className="px-3 py-1.5 text-sm text-secondary hover:text-foreground transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleSavePrompt}
                        className="px-3 py-1.5 text-sm bg-accent text-white rounded-md hover:opacity-90 transition-opacity"
                      >
                        Apply
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-6">
                  {(Object.keys(PROMPT_CATEGORIES) as PromptCategory[]).map((category) => (
                    <div key={category}>
                      <div className="mb-3">
                        <h4 className="text-sm font-medium text-foreground">
                          {PROMPT_CATEGORIES[category].name}
                        </h4>
                        <p className="text-xs text-muted">
                          {PROMPT_CATEGORIES[category].description}
                        </p>
                      </div>
                      <div className="space-y-2">
                        {promptsByCategory[category].map((template) => (
                          <div
                            key={template.id}
                            className="p-3 rounded-lg border border-border bg-background hover:border-secondary transition-colors"
                          >
                            <div className="flex items-start justify-between gap-4">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <h5 className="text-sm font-medium text-foreground">
                                    {template.name}
                                  </h5>
                                  {isPromptModified(template.id) && (
                                    <span className="px-1.5 py-0.5 text-xs bg-accent/10 text-accent rounded">
                                      Modified
                                    </span>
                                  )}
                                </div>
                                <p className="text-xs text-muted mt-0.5">
                                  {template.description}
                                </p>
                              </div>
                              <div className="flex items-center gap-2 flex-shrink-0">
                                {isPromptModified(template.id) && (
                                  <button
                                    onClick={() => handleResetPrompt(template.id)}
                                    className="px-2 py-1 text-xs text-muted hover:text-foreground transition-colors"
                                  >
                                    Reset
                                  </button>
                                )}
                                <button
                                  onClick={() => handleEditPrompt(template.id)}
                                  className="px-2 py-1 text-xs text-accent hover:bg-accent/10 rounded transition-colors"
                                >
                                  Edit
                                </button>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 px-6 py-4 border-t border-border bg-background-secondary">
          <button
            onClick={handleCancel}
            className="px-4 py-2 rounded-lg text-secondary hover:text-foreground hover:bg-card transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="px-4 py-2 rounded-lg bg-accent text-white font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {isSaving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
