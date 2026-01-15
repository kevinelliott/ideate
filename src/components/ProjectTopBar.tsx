import { useState, useEffect, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import { defaultPlugins, type AgentPlugin } from "../types";
import { useBuildStore } from "../stores/buildStore";
import { useCostStore } from "../stores/costStore";
import { usePrdStore } from "../stores/prdStore";
import { CostModal } from "./CostModal";

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
  logBufferSize: number;
  agentPaths: Array<{ agentId: string; path: string }>;
  theme: string;
  promptOverrides: Record<string, string>;
}

interface ProjectTopBarProps {
  projectId: string;
  projectPath: string;
  projectName: string;
  projectDescription: string;
}

const autonomyOptions: { value: AutonomyLevel; label: string }[] = [
  { value: "autonomous", label: "Auto" },
  { value: "pause-between", label: "Pause" },
  { value: "manual", label: "Manual" },
];

const buildModeOptions: { value: BuildMode; label: string; description: string }[] = [
  { value: "ralph", label: "Ralph", description: "Sequential story execution" },
  { value: "parallel", label: "Parallel", description: "Run stories concurrently" },
  { value: "none", label: "None", description: "No automatic building" },
];

function AgentIcon() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
    </svg>
  );
}

function AutoIcon() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
    </svg>
  );
}

function PauseIcon() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

function ManualIcon() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 11.5V14m0-2.5v-6a1.5 1.5 0 113 0m-3 6a1.5 1.5 0 00-3 0v2a7.5 7.5 0 0015 0v-5a1.5 1.5 0 00-3 0m-6-3V11m0-5.5v-1a1.5 1.5 0 013 0v1m0 0V11m0-5.5a1.5 1.5 0 013 0v3m0 0V11" />
    </svg>
  );
}

function RalphIcon() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 4h13M3 8h9m-9 4h6m4 0l4-4m0 0l4 4m-4-4v12" />
    </svg>
  );
}

function ParallelIcon() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 6h16M4 12h16M4 18h16" />
    </svg>
  );
}

function NoneIcon() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
    </svg>
  );
}

function getAutonomyIcon(level: AutonomyLevel) {
  switch (level) {
    case "autonomous":
      return <AutoIcon />;
    case "pause-between":
      return <PauseIcon />;
    case "manual":
      return <ManualIcon />;
  }
}

function getBuildModeIcon(mode: BuildMode) {
  switch (mode) {
    case "ralph":
      return <RalphIcon />;
    case "parallel":
      return <ParallelIcon />;
    case "none":
      return <NoneIcon />;
  }
}

export function ProjectTopBar({ projectId, projectPath, projectName, projectDescription }: ProjectTopBarProps) {
  const [selectedAgent, setSelectedAgent] = useState<string>("");
  const [autonomyLevel, setAutonomyLevel] = useState<AutonomyLevel>("autonomous");
  const [buildMode, setBuildMode] = useState<BuildMode>("ralph");
  const [isLoading, setIsLoading] = useState(true);
  const [isCostModalOpen, setIsCostModalOpen] = useState(false);

  const buildStatus = useBuildStore((state) => state.projectStates[projectId]?.status ?? 'idle');
  const startBuild = useBuildStore((state) => state.startBuild);
  const pauseBuild = useBuildStore((state) => state.pauseBuild);
  const resumeBuild = useBuildStore((state) => state.resumeBuild);
  const cancelBuild = useBuildStore((state) => state.cancelBuild);
  
  const stories = usePrdStore((state) => state.stories);
  const hasIncompleteStories = stories.some((s) => !s.passes);
  const hasStories = stories.length > 0;
  const canStart = hasStories && hasIncompleteStories && buildStatus === "idle";
  
  const isBuilding = buildStatus === "running" || buildStatus === "paused";

  const entries = useCostStore((state) => state.entries);
  const projectSummary = useMemo(() => {
    const projectEntries = entries.filter((e) => e.projectId === projectId);
    return projectEntries.reduce(
      (acc, entry) => ({
        totalCost: acc.totalCost + (entry.cost || 0),
        totalInputTokens: acc.totalInputTokens + (entry.inputTokens || 0),
        totalOutputTokens: acc.totalOutputTokens + (entry.outputTokens || 0),
        totalTokens: acc.totalTokens + (entry.totalTokens || 0),
        entryCount: acc.entryCount + 1,
      }),
      { totalCost: 0, totalInputTokens: 0, totalOutputTokens: 0, totalTokens: 0, entryCount: 0 }
    );
  }, [entries, projectId]);
  
  const hasCostData = projectSummary.entryCount > 0;

  useEffect(() => {
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
          
          if (settings) {
            setSelectedAgent(settings.agent || defaultAgent);
            setAutonomyLevel(settings.autonomy || defaultAutonomy);
            setBuildMode(settings.buildMode || defaultBuildMode);
          } else {
            setSelectedAgent(defaultAgent);
            setAutonomyLevel(defaultAutonomy);
            setBuildMode(defaultBuildMode);
          }
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
  }, [projectId, projectPath]);

  const handleAgentChange = async (agentId: string) => {
    if (isBuilding) return;
    setSelectedAgent(agentId);
    await saveSettings(agentId, autonomyLevel, buildMode);
  };

  const handleAutonomyChange = async (level: AutonomyLevel) => {
    if (isBuilding) return;
    setAutonomyLevel(level);
    await saveSettings(selectedAgent, level, buildMode);
  };

  const handleBuildModeChange = async (mode: BuildMode) => {
    if (isBuilding) return;
    setBuildMode(mode);
    await saveSettings(selectedAgent, autonomyLevel, mode);
  };

  const saveSettings = async (agent: string, autonomy: AutonomyLevel, mode: BuildMode) => {
    try {
      await invoke("save_project_settings", {
        projectPath,
        settings: {
          agent: agent || null,
          autonomy,
          buildMode: mode,
        },
      });
      // Notify other components that settings have changed
      window.dispatchEvent(new CustomEvent("project-settings-changed", { 
        detail: { projectId, projectPath } 
      }));
    } catch (err) {
      console.error("Failed to save project settings:", err);
    }
  };

  return (
    <>
      <div className="h-12 flex items-center justify-between px-4 border-b border-border bg-background drag-region">
        <div className="flex items-center gap-3 no-drag">
          <h1 className="text-sm font-medium text-foreground truncate max-w-[200px]">
            {projectName}
          </h1>
          {projectDescription && (
            <span className="text-xs text-muted truncate max-w-[300px] hidden lg:block">
              {projectDescription}
            </span>
          )}
        </div>
        
        <div className="flex items-center gap-2 no-drag">
          {!isLoading && (
            <>
              {/* Cost button */}
              <button
                onClick={() => setIsCostModalOpen(true)}
                className="flex items-center gap-1 px-2 py-1 rounded text-xs text-muted hover:text-foreground hover:bg-card transition-colors"
                title="View usage & costs"
              >
                <span className="font-medium">$</span>
                {hasCostData && projectSummary.totalCost > 0 && (
                  <span className="text-accent">{projectSummary.totalCost.toFixed(2)}</span>
                )}
              </button>

              <div className="w-px h-4 bg-border" />

              {/* Build Mode selector */}
              <div className={`flex items-center gap-1.5 ${isBuilding ? 'opacity-50' : ''}`}>
                <span className="text-muted">
                  {getBuildModeIcon(buildMode)}
                </span>
                <select
                  value={buildMode}
                  onChange={(e) => handleBuildModeChange(e.target.value as BuildMode)}
                  disabled={isBuilding}
                  className={`bg-transparent text-xs text-secondary border-none outline-none pr-4 appearance-none ${
                    isBuilding ? 'cursor-not-allowed' : 'cursor-pointer hover:text-foreground'
                  }`}
                  style={{
                    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23717179' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`,
                    backgroundRepeat: 'no-repeat',
                    backgroundPosition: 'right center',
                    paddingRight: '16px'
                  }}
                  title={buildModeOptions.find(o => o.value === buildMode)?.description}
                >
                  {buildModeOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="w-px h-4 bg-border" />

              {/* Agent selector */}
              <div className={`flex items-center gap-1.5 ${isBuilding ? 'opacity-50' : ''}`}>
                <span className="text-muted">
                  <AgentIcon />
                </span>
                <select
                  value={selectedAgent}
                  onChange={(e) => handleAgentChange(e.target.value)}
                  disabled={isBuilding}
                  className={`bg-transparent text-xs text-secondary border-none outline-none pr-4 appearance-none ${
                    isBuilding ? 'cursor-not-allowed' : 'cursor-pointer hover:text-foreground'
                  }`}
                  style={{
                    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23717179' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`,
                    backgroundRepeat: 'no-repeat',
                    backgroundPosition: 'right center',
                    paddingRight: '16px'
                  }}
                >
                  <option value="">No agent</option>
                  {defaultPlugins.map((plugin: AgentPlugin) => (
                    <option key={plugin.id} value={plugin.id}>
                      {plugin.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="w-px h-4 bg-border" />

              {/* Autonomy selector */}
              <div className={`flex items-center gap-1.5 ${isBuilding ? 'opacity-50' : ''}`}>
                <span className="text-muted">
                  {getAutonomyIcon(autonomyLevel)}
                </span>
                <select
                  value={autonomyLevel}
                  onChange={(e) => handleAutonomyChange(e.target.value as AutonomyLevel)}
                  disabled={isBuilding}
                  className={`bg-transparent text-xs text-secondary border-none outline-none pr-4 appearance-none ${
                    isBuilding ? 'cursor-not-allowed' : 'cursor-pointer hover:text-foreground'
                  }`}
                  style={{
                    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23717179' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`,
                    backgroundRepeat: 'no-repeat',
                    backgroundPosition: 'right center',
                    paddingRight: '16px'
                  }}
                >
                  {autonomyOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="w-px h-4 bg-border" />

              {/* Build control buttons */}
              <div className="flex items-center gap-1">
                {buildStatus === "idle" && (
                  <button
                    onClick={() => startBuild(projectId)}
                    disabled={!canStart}
                    className={`p-1.5 rounded transition-colors ${
                      canStart
                        ? 'text-success hover:bg-success/10'
                        : 'text-muted cursor-not-allowed'
                    }`}
                    title={canStart ? "Start build" : hasStories ? "All stories complete" : "No stories to build"}
                  >
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M8 5v14l11-7z" />
                    </svg>
                  </button>
                )}
                {buildStatus === "running" && (
                  <button
                    onClick={() => pauseBuild(projectId)}
                    className="p-1.5 rounded text-warning hover:bg-warning/10 transition-colors"
                    title="Pause build"
                  >
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
                    </svg>
                  </button>
                )}
                {buildStatus === "paused" && (
                  <button
                    onClick={() => resumeBuild(projectId)}
                    className="p-1.5 rounded text-success hover:bg-success/10 transition-colors"
                    title="Resume build"
                  >
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M8 5v14l11-7z" />
                    </svg>
                  </button>
                )}
                {(buildStatus === "running" || buildStatus === "paused") && (
                  <button
                    onClick={() => cancelBuild(projectId)}
                    className="p-1.5 rounded text-destructive hover:bg-destructive/10 transition-colors"
                    title="Stop build"
                  >
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M6 6h12v12H6z" />
                    </svg>
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      <CostModal
        isOpen={isCostModalOpen}
        onClose={() => setIsCostModalOpen(false)}
        projectId={projectId}
        projectPath={projectPath}
        projectName={projectName}
      />
    </>
  );
}
