import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useTheme, type ColorMode, type ThemeId } from "../hooks/useTheme";
import { getTheme } from "../themes";
import { useModalKeyboard } from "../hooks/useModalKeyboard";
import { DEFAULT_PROMPTS, PROMPT_CATEGORIES, getPromptsByCategory, type PromptCategory } from "../utils/prompts";
import { useIntegrationsStore, type OutRayConfig } from "../stores/integrationsStore";

interface Preferences {
  defaultAgent: string | null;
  defaultAutonomy: string;
  defaultBuildMode: string;
  logBufferSize: number;
  maxParallelAgents: number;
  agentPaths: Array<{ agentId: string; path: string }>;
  themeId: string;
  colorMode: string;
  theme: string; // legacy
  appIcon: string;
  promptOverrides: Record<string, string>;
  outray?: OutRayConfig;
  buildNotifications: boolean;
  maxTokensPerStory: number | null;
  maxCostPerBuild: number | null;
  warnOnLargeStory: boolean;
}

interface AgentModel {
  id: string;
  name: string;
  provider?: string;
}


interface AgentPluginStatus {
  id: string;
  name: string;
  command: string;
  versionCommand: string[];
  printArgs: string[];
  interactiveArgs: string[];
  defaultModel?: string;
  supportedModels: AgentModel[];
  capabilities: string[];
  website: string;
  description: string;
  status: "available" | "not-installed" | "unknown";
  installedVersion?: string;
  cliPath?: string;
}

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type SettingsTab = "general" | "agents" | "prompts" | "integrations";
type AppIconVariant = "transparent" | "light" | "dark";

export function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  const { themeId, colorMode, resolvedMode, setThemeId, setColorMode, availableThemes } = useTheme();
  
  const [activeTab, setActiveTab] = useState<SettingsTab>("general");
  const [defaultAgent, setDefaultAgent] = useState<string>("claude-code");
  const [defaultAutonomy, setDefaultAutonomy] = useState<string>("autonomous");
  const [defaultBuildMode, setDefaultBuildMode] = useState<string>("ralph");
  const [logBufferSize, setLogBufferSize] = useState<number>(1000);
  const [maxParallelAgents, setMaxParallelAgents] = useState<number>(4);
  const [appIcon, setAppIcon] = useState<AppIconVariant>("transparent");
  const [buildNotifications, setBuildNotifications] = useState<boolean>(true);
  const [promptOverrides, setPromptOverrides] = useState<Record<string, string>>({});
  const [editingPromptId, setEditingPromptId] = useState<string | null>(null);
  const [editingPromptValue, setEditingPromptValue] = useState<string>("");
  const [_isDirty, setIsDirty] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [iconChanged, setIconChanged] = useState(false);
  const [maxTokensPerStory, setMaxTokensPerStory] = useState<number | null>(null);
  const [maxCostPerBuild, setMaxCostPerBuild] = useState<number | null>(null);
  const [warnOnLargeStory, setWarnOnLargeStory] = useState<boolean>(true);
  
  // Agent detection state
  const [agentStatuses, setAgentStatuses] = useState<AgentPluginStatus[]>([]);
  const [isDetectingAgents, setIsDetectingAgents] = useState(false);

  // Integrations store
  const outrayConfig = useIntegrationsStore((state) => state.outray);
  const setOutRayConfig = useIntegrationsStore((state) => state.setOutRayConfig);
  const loadIntegrationsConfig = useIntegrationsStore((state) => state.loadConfig);

  // OutRay auth state
  const [outrayLoggedIn, setOutrayLoggedIn] = useState<boolean | null>(null);
  const [outrayLoggingIn, setOutrayLoggingIn] = useState(false);
  const [outrayLoginError, setOutrayLoginError] = useState<string | null>(null);

  useModalKeyboard(isOpen, onClose);

  useEffect(() => {
    if (isOpen) {
      loadPreferences();
      loadIntegrationsConfig();
      setActiveTab("general");
      setEditingPromptId(null);
      setIconChanged(false);
    }
  }, [isOpen, loadIntegrationsConfig]);

  useEffect(() => {
    if (isOpen && activeTab === "agents" && agentStatuses.length === 0) {
      detectAgents();
    }
  }, [isOpen, activeTab]);

  // Check OutRay auth status when integrations tab is active and OutRay is enabled
  useEffect(() => {
    if (isOpen && activeTab === "integrations" && outrayConfig.enabled) {
      checkOutrayAuth();
    }
  }, [isOpen, activeTab, outrayConfig.enabled]);

  const checkOutrayAuth = async () => {
    try {
      const customPath = outrayConfig.useCustomPath ? outrayConfig.cliPath : null;
      const isLoggedIn = await invoke<boolean>("check_auth", { customCliPath: customPath });
      setOutrayLoggedIn(isLoggedIn);
    } catch {
      setOutrayLoggedIn(false);
    }
  };

  interface OutrayLoginResult {
    success: boolean;
    needsSetup: boolean;
    setupUrl: string | null;
    error: string | null;
  }

  const handleOutrayLogin = async () => {
    setOutrayLoggingIn(true);
    setOutrayLoginError(null);
    try {
      const customPath = outrayConfig.useCustomPath ? outrayConfig.cliPath : null;
      const result = await invoke<OutrayLoginResult>("login", { customCliPath: customPath });
      
      if (result.success) {
        setOutrayLoggedIn(true);
      } else if (result.needsSetup && result.setupUrl) {
        setOutrayLoginError("Please complete your account setup first.");
        // Open the dashboard in a new window
        await invoke("open_dashboard");
        setOutrayLoggedIn(false);
      } else {
        setOutrayLoginError(result.error || "Login failed");
        setOutrayLoggedIn(false);
      }
    } catch (e) {
      console.error("OutRay login failed:", e);
      setOutrayLoginError(String(e));
      setOutrayLoggedIn(false);
    } finally {
      setOutrayLoggingIn(false);
    }
  };

  const loadPreferences = async () => {
    try {
      const prefs = await invoke<Preferences | null>("load_preferences");
      if (prefs) {
        setDefaultAgent(prefs.defaultAgent || "claude-code");
        setDefaultAutonomy(prefs.defaultAutonomy || "autonomous");
        setDefaultBuildMode(prefs.defaultBuildMode || "ralph");
        setLogBufferSize(prefs.logBufferSize || 1000);
        setMaxParallelAgents(prefs.maxParallelAgents || 4);
        setAppIcon((prefs.appIcon as AppIconVariant) || "transparent");
        setBuildNotifications(prefs.buildNotifications ?? true);
        setPromptOverrides(prefs.promptOverrides || {});
        setMaxTokensPerStory(prefs.maxTokensPerStory ?? null);
        setMaxCostPerBuild(prefs.maxCostPerBuild ?? null);
        setWarnOnLargeStory(prefs.warnOnLargeStory ?? true);
      }
      setIsDirty(false);
    } catch (error) {
      console.error("Failed to load preferences:", error);
    }
  };

  const detectAgents = async () => {
    setIsDetectingAgents(true);
    try {
      const statuses = await invoke<AgentPluginStatus[]>("detect_agents");
      setAgentStatuses(statuses);
    } catch (error) {
      console.error("Failed to detect agents:", error);
    } finally {
      setIsDetectingAgents(false);
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
        maxParallelAgents,
        agentPaths: [],
        themeId: themeId,
        colorMode: colorMode,
        theme: colorMode, // legacy field
        appIcon,
        promptOverrides,
        outray: outrayConfig,
        buildNotifications,
        maxTokensPerStory,
        maxCostPerBuild,
        warnOnLargeStory,
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

  const handleColorModeChange = (newMode: ColorMode) => {
    setColorMode(newMode);
    setIsDirty(true);
  };

  const handleThemeIdChange = (newThemeId: ThemeId) => {
    setThemeId(newThemeId);
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

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "available":
        return (
          <span className="px-2 py-0.5 text-xs rounded-full bg-success/20 text-success">
            Installed
          </span>
        );
      case "not-installed":
        return (
          <span className="px-2 py-0.5 text-xs rounded-full bg-muted/50 text-muted">
            Not Installed
          </span>
        );
      default:
        return (
          <span className="px-2 py-0.5 text-xs rounded-full bg-warning/20 text-warning">
            Unknown
          </span>
        );
    }
  };

  const getCapabilityIcon = (capability: string) => {
    switch (capability) {
      case "code-editing":
        return "✏️";
      case "code-review":
        return "👁️";
      case "chat":
        return "💬";
      case "autonomous":
        return "🤖";
      case "multi-model":
        return "🔀";
      case "mcp":
        return "🔌";
      case "web-search":
        return "🔍";
      default:
        return "•";
    }
  };

  if (!isOpen) return null;

  const promptsByCategory = getPromptsByCategory();
  const availableAgents = agentStatuses.filter(a => a.status === "available");

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
              onClick={() => setActiveTab("agents")}
              className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                activeTab === "agents"
                  ? "bg-accent/10 text-accent"
                  : "text-secondary hover:text-foreground"
              }`}
            >
              Agents
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
            <button
              onClick={() => setActiveTab("integrations")}
              className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                activeTab === "integrations"
                  ? "bg-accent/10 text-accent"
                  : "text-secondary hover:text-foreground"
              }`}
            >
              Integrations
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
                  {/* Theme Selection */}
                  <div>
                    <label className="block text-sm text-foreground mb-2">Theme</label>
                    <div className="grid grid-cols-3 gap-2">
                      {availableThemes.map((t) => {
                        const themeDef = getTheme(t.id);
                        const colors = resolvedMode === 'dark' ? themeDef.dark : themeDef.light;
                        return (
                          <button
                            key={t.id}
                            onClick={() => handleThemeIdChange(t.id as ThemeId)}
                            className={`flex flex-col items-start p-3 rounded-lg border transition-colors text-left ${
                              themeId === t.id
                                ? "border-accent bg-accent/10"
                                : "border-border hover:border-secondary"
                            }`}
                          >
                            <div className="flex gap-1 mb-2">
                              <div
                                className="w-4 h-4 rounded-full border border-black/10"
                                style={{ backgroundColor: `rgb(${colors.background})` }}
                                title="Background"
                              />
                              <div
                                className="w-4 h-4 rounded-full border border-black/10"
                                style={{ backgroundColor: `rgb(${colors.accent})` }}
                                title="Accent"
                              />
                              <div
                                className="w-4 h-4 rounded-full border border-black/10"
                                style={{ backgroundColor: `rgb(${colors.foreground})` }}
                                title="Foreground"
                              />
                              <div
                                className="w-4 h-4 rounded-full border border-black/10"
                                style={{ backgroundColor: `rgb(${colors.card})` }}
                                title="Card"
                              />
                            </div>
                            <span className={`text-sm font-medium ${themeId === t.id ? "text-accent" : "text-foreground"}`}>
                              {t.name}
                            </span>
                            <span className="text-xs text-muted mt-0.5 line-clamp-2">
                              {t.description}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Color Mode Selection */}
                  <div>
                    <label className="block text-sm text-foreground mb-2">Color Mode</label>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleColorModeChange("light")}
                        className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg border transition-colors ${
                          colorMode === "light"
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
                        onClick={() => handleColorModeChange("dark")}
                        className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg border transition-colors ${
                          colorMode === "dark"
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
                        onClick={() => handleColorModeChange("system")}
                        className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg border transition-colors ${
                          colorMode === "system"
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
                        <div className="w-16 h-16 rounded-xl bg-gradient-to-br from-card to-background border border-border flex items-center justify-center overflow-hidden">
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
                        <div className="w-16 h-16 rounded-xl bg-[#f5f5f5] border border-border flex items-center justify-center overflow-hidden">
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
                      {availableAgents.length > 0 ? (
                        availableAgents.map((agent) => (
                          <option key={agent.id} value={agent.id}>
                            {agent.name}
                          </option>
                        ))
                      ) : (
                        <>
                          <option value="claude-code">Claude Code</option>
                          <option value="amp">Amp</option>
                        </>
                      )}
                    </select>
                    <p className="text-xs text-muted mt-1">
                      See the Agents tab to detect and configure available agents.
                    </p>
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

                  <div>
                    <label className="block text-sm text-foreground mb-2">Max Parallel Agents</label>
                    <input
                      type="number"
                      value={maxParallelAgents}
                      onChange={(e) => {
                        const v = parseInt(e.target.value, 10);
                        setMaxParallelAgents(Number.isFinite(v) && v > 0 ? Math.min(v, 8) : 4);
                        setIsDirty(true);
                      }}
                      min={1}
                      max={8}
                      className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-accent"
                    />
                    <p className="text-xs text-muted mt-1">
                      Maximum number of stories to build concurrently in Parallel mode.
                    </p>
                  </div>

                  <div className="flex items-center justify-between">
                    <div>
                      <label className="text-sm font-medium text-foreground">
                        Build Notifications
                      </label>
                      <p className="text-xs text-muted mt-0.5">
                        Show native notifications for story completion and build status
                      </p>
                    </div>
                    <button
                      onClick={() => {
                        setBuildNotifications(!buildNotifications);
                        setIsDirty(true);
                      }}
                      className={`relative w-11 h-6 rounded-full transition-colors ${
                        buildNotifications ? "bg-accent" : "bg-muted/30"
                      }`}
                    >
                      <span
                        className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-transform ${
                          buildNotifications ? "translate-x-5" : ""
                        }`}
                      />
                    </button>
                  </div>
                </div>
              </section>

              {/* Budget Limits Section */}
              <section>
                <h3 className="text-sm font-medium text-secondary uppercase tracking-wider mb-3">
                  Budget Limits
                </h3>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm text-foreground mb-2">Max Tokens Per Story</label>
                    <input
                      type="number"
                      value={maxTokensPerStory ?? ""}
                      onChange={(e) => {
                        const val = e.target.value ? parseInt(e.target.value) : null;
                        setMaxTokensPerStory(val);
                        setIsDirty(true);
                      }}
                      min={1000}
                      step={1000}
                      placeholder="Unlimited"
                      className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-accent placeholder:text-secondary/60"
                    />
                    <p className="text-xs text-muted mt-1">
                      Warn when a story&apos;s estimated tokens exceed this limit. Leave empty for no limit.
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm text-foreground mb-2">Max Cost Per Build ($)</label>
                    <input
                      type="number"
                      value={maxCostPerBuild ?? ""}
                      onChange={(e) => {
                        const val = e.target.value ? parseFloat(e.target.value) : null;
                        setMaxCostPerBuild(val);
                        setIsDirty(true);
                      }}
                      min={0.01}
                      step={0.5}
                      placeholder="Unlimited"
                      className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-accent placeholder:text-secondary/60"
                    />
                    <p className="text-xs text-muted mt-1">
                      Soft limit on total estimated cost per build. Leave empty for no limit.
                    </p>
                  </div>

                  <div className="flex items-center justify-between">
                    <div>
                      <label className="text-sm font-medium text-foreground">
                        Warn on Large Stories
                      </label>
                      <p className="text-xs text-muted mt-0.5">
                        Show complexity warnings for stories that may use significant tokens
                      </p>
                    </div>
                    <button
                      onClick={() => {
                        setWarnOnLargeStory(!warnOnLargeStory);
                        setIsDirty(true);
                      }}
                      className={`relative w-11 h-6 rounded-full transition-colors ${
                        warnOnLargeStory ? "bg-accent" : "bg-muted/30"
                      }`}
                    >
                      <span
                        className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-transform ${
                          warnOnLargeStory ? "translate-x-5" : ""
                        }`}
                      />
                    </button>
                  </div>
                </div>
              </section>
            </>
          )}

          {activeTab === "agents" && (
            <section>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-sm font-medium text-foreground">AI Coding Agents</h3>
                  <p className="text-xs text-muted mt-1">
                    Detected CLI agents on your system. Install agents to use them in builds.
                  </p>
                </div>
                <button
                  onClick={detectAgents}
                  disabled={isDetectingAgents}
                  className="px-3 py-1.5 text-xs rounded-md border border-border hover:bg-card transition-colors disabled:opacity-50"
                >
                  {isDetectingAgents ? "Detecting..." : "Refresh"}
                </button>
              </div>

              {isDetectingAgents && agentStatuses.length === 0 ? (
                <div className="text-center py-8 text-secondary">
                  <svg className="w-6 h-6 mx-auto mb-2 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  Detecting installed agents...
                </div>
              ) : (
                <div className="space-y-3">
                  {agentStatuses.map((agent) => (
                    <div
                      key={agent.id}
                      className={`p-4 rounded-lg border transition-colors ${
                        agent.status === "available"
                          ? "border-success/30 bg-success/5"
                          : "border-border bg-background"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <h4 className="text-sm font-medium text-foreground">
                              {agent.name}
                            </h4>
                            {getStatusBadge(agent.status)}
                            {agent.id === defaultAgent && (
                              <span className="px-2 py-0.5 text-xs rounded-full bg-accent/20 text-accent">
                                Default
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-muted mb-2">
                            {agent.description}
                          </p>
                          <div className="flex flex-wrap gap-1 mb-2">
                            {agent.capabilities.slice(0, 5).map((cap) => (
                              <span
                                key={cap}
                                className="px-1.5 py-0.5 text-[10px] rounded bg-card text-secondary"
                                title={cap}
                              >
                                {getCapabilityIcon(cap)} {cap}
                              </span>
                            ))}
                          </div>
                          {agent.status === "available" && (
                            <div className="text-xs text-secondary space-y-0.5">
                              {agent.installedVersion && (
                                <div>Version: <span className="text-foreground">{agent.installedVersion}</span></div>
                              )}
                              {agent.cliPath && (
                                <div className="truncate">Path: <span className="text-foreground font-mono">{agent.cliPath}</span></div>
                              )}
                            </div>
                          )}
                        </div>
                        <div className="flex-shrink-0">
                          {agent.status === "available" ? (
                            <button
                              onClick={() => {
                                setDefaultAgent(agent.id);
                                setIsDirty(true);
                              }}
                              disabled={agent.id === defaultAgent}
                              className={`px-3 py-1.5 text-xs rounded-md transition-colors ${
                                agent.id === defaultAgent
                                  ? "bg-accent/20 text-accent cursor-default"
                                  : "bg-card hover:bg-accent/10 text-secondary hover:text-accent"
                              }`}
                            >
                              {agent.id === defaultAgent ? "Default" : "Set Default"}
                            </button>
                          ) : (
                            <a
                              href={agent.website}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="px-3 py-1.5 text-xs rounded-md bg-card hover:bg-accent/10 text-secondary hover:text-accent transition-colors inline-flex items-center gap-1"
                            >
                              Install
                              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                              </svg>
                            </a>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="mt-6 p-4 rounded-lg bg-card/50 border border-border">
                <h4 className="text-sm font-medium text-foreground mb-2">About Agent CLIs</h4>
                <p className="text-xs text-muted leading-relaxed">
                  Ideate works with AI coding agent CLIs installed on your system. Each agent has its own 
                  capabilities, supported models, and pricing. Install the agents you want to use, then 
                  set your preferred default agent above.
                </p>
              </div>
            </section>
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

          {activeTab === "integrations" && (
            <section>
              {/* OutRay Section */}
              <div className="mb-6">
                <div className="flex items-center gap-3 mb-3">
                  <h3 className="text-sm font-medium text-secondary uppercase tracking-wider">
                    OutRay Tunneling
                  </h3>
                  <a
                    href="https://outray.dev"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-accent hover:underline"
                  >
                    outray.dev
                  </a>
                </div>
                <p className="text-xs text-muted mb-4">
                  Share your local dev server with anyone on the internet using secure tunnels.
                  OutRay provides a free tier with unlimited tunnels.
                </p>
                <div className="space-y-4 bg-background rounded-lg p-4 border border-border">
                  <div className="flex items-center justify-between">
                    <div>
                      <label className="text-sm font-medium text-foreground">
                        Enable OutRay
                      </label>
                      <p className="text-xs text-muted mt-0.5">
                        Show tunnel button in preview panel
                      </p>
                    </div>
                    <button
                      onClick={() => setOutRayConfig({ enabled: !outrayConfig.enabled })}
                      className={`relative w-11 h-6 rounded-full transition-colors ${
                        outrayConfig.enabled ? "bg-accent" : "bg-muted/30"
                      }`}
                    >
                      <span
                        className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-transform ${
                          outrayConfig.enabled ? "translate-x-5" : ""
                        }`}
                      />
                    </button>
                  </div>

                  {outrayConfig.enabled && (
                    <>
                      {/* CLI Source Selection */}
                      <div>
                        <label className="block text-sm font-medium text-foreground mb-2">
                          OutRay CLI
                        </label>
                        <div className="space-y-2">
                          <label className="flex items-center gap-3 p-3 rounded-lg border border-border hover:border-secondary cursor-pointer transition-colors">
                            <input
                              type="radio"
                              name="outray-source"
                              checked={!outrayConfig.useCustomPath}
                              onChange={() => setOutRayConfig({ useCustomPath: false })}
                              className="w-4 h-4 text-accent"
                            />
                            <div className="flex-1">
                              <span className="text-sm font-medium text-foreground">Use bundled</span>
                              <p className="text-xs text-muted mt-0.5">
                                Uses the OutRay binary included with Ideate
                              </p>
                            </div>
                          </label>
                          <label className="flex items-center gap-3 p-3 rounded-lg border border-border hover:border-secondary cursor-pointer transition-colors">
                            <input
                              type="radio"
                              name="outray-source"
                              checked={outrayConfig.useCustomPath}
                              onChange={() => setOutRayConfig({ useCustomPath: true })}
                              className="w-4 h-4 text-accent"
                            />
                            <div className="flex-1">
                              <span className="text-sm font-medium text-foreground">Use custom path</span>
                              <p className="text-xs text-muted mt-0.5">
                                Specify a custom OutRay CLI installation
                              </p>
                            </div>
                          </label>
                        </div>
                      </div>

                      {/* Custom Path Input (only shown when custom path is selected) */}
                      {outrayConfig.useCustomPath && (
                        <div>
                          <label
                            htmlFor="outray-cli-path"
                            className="block text-sm font-medium text-foreground mb-1.5"
                          >
                            CLI Path
                          </label>
                          <input
                            id="outray-cli-path"
                            type="text"
                            value={outrayConfig.cliPath || ""}
                            onChange={(e) => setOutRayConfig({ cliPath: e.target.value || null })}
                            placeholder="/usr/local/bin/outray"
                            className="w-full px-3 py-2 bg-card border border-border rounded-lg text-foreground text-sm placeholder:text-secondary/60 focus:ring-2 focus:ring-accent focus:border-transparent transition-all"
                          />
                          <p className="mt-1.5 text-xs text-muted">
                            Full path to your OutRay CLI binary
                          </p>
                        </div>
                      )}

                      <div>
                        <label
                          htmlFor="outray-subdomain"
                          className="block text-sm font-medium text-foreground mb-1.5"
                        >
                          Default Subdomain
                        </label>
                        <input
                          id="outray-subdomain"
                          type="text"
                          value={outrayConfig.defaultSubdomain || ""}
                          onChange={(e) => setOutRayConfig({ defaultSubdomain: e.target.value || null })}
                          placeholder="my-project"
                          className="w-full px-3 py-2 bg-card border border-border rounded-lg text-foreground text-sm placeholder:text-secondary/60 focus:ring-2 focus:ring-accent focus:border-transparent transition-all"
                        />
                        <p className="mt-1.5 text-xs text-muted">
                          Request a specific subdomain (e.g., my-project.outray.app). Optional.
                        </p>
                      </div>

                      {/* Authentication Section */}
                      <div className="pt-3 border-t border-border">
                        <div className="flex items-center justify-between">
                          <div>
                            <label className="text-sm font-medium text-foreground">
                              Authentication
                            </label>
                            <p className="text-xs text-muted mt-0.5">
                              {outrayLoggedIn === null
                                ? "Checking..."
                                : outrayLoggedIn
                                ? "You are logged in to OutRay"
                                : "Login to OutRay to create tunnels"}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            {outrayLoggedIn === true && (
                              <span className="flex items-center gap-1 text-xs text-success">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                </svg>
                                Logged in
                              </span>
                            )}
                            <button
                              onClick={handleOutrayLogin}
                              disabled={outrayLoggingIn}
                              className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
                                outrayLoggedIn
                                  ? "bg-card text-secondary hover:text-foreground"
                                  : "bg-accent text-white hover:opacity-90"
                              } disabled:opacity-50`}
                            >
                              {outrayLoggingIn ? (
                                <span className="flex items-center gap-2">
                                  <svg className="w-4 h-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                  </svg>
                                  Logging in...
                                </span>
                              ) : outrayLoggedIn ? (
                                "Re-login"
                              ) : (
                                "Login to OutRay"
                              )}
                            </button>
                          </div>
                        </div>
                        {outrayLoginError && (
                          <p className="mt-2 text-xs text-destructive">
                            {outrayLoginError}
                          </p>
                        )}
                      </div>
                    </>
                  )}
                </div>
              </div>
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
