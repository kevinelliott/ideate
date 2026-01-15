import { useState, useEffect, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import { usePrdStore } from "../stores/prdStore";
import { useBuildStore } from "../stores/buildStore";
import { useCostStore } from "../stores/costStore";
import type { Project } from "../stores/projectStore";
import { defaultPlugins } from "../types";

type AutonomyLevel = "autonomous" | "pause-between" | "manual";
type BuildMode = "ralph" | "parallel" | "none";

interface ProjectSettings {
  agent: string | null;
  autonomy: AutonomyLevel;
  buildMode: BuildMode | null;
}

interface OverviewContentProps {
  project: Project;
}

const autonomyLabels: Record<AutonomyLevel, string> = {
  autonomous: "Autonomous",
  "pause-between": "Pause Between Stories",
  manual: "Manual",
};

const buildModeLabels: Record<BuildMode, string> = {
  ralph: "Ralph (Sequential)",
  parallel: "Parallel",
  none: "None",
};

export function OverviewContent({ project }: OverviewContentProps) {
  const stories = usePrdStore((state) => state.stories);
  const getProjectState = useBuildStore((state) => state.getProjectState);
  const entries = useCostStore((state) => state.entries);

  const [settings, setSettings] = useState<ProjectSettings | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const projectState = getProjectState(project.id);
  const buildStatus = projectState.status;

  // Load settings from disk
  const loadSettings = async (showLoading = true) => {
    if (showLoading) setIsLoading(true);
    try {
      const loadedSettings = await invoke<ProjectSettings | null>("load_project_settings", {
        projectPath: project.path,
      });
      setSettings(loadedSettings);
    } catch (error) {
      console.error("Failed to load project settings:", error);
    } finally {
      if (showLoading) setIsLoading(false);
    }
  };

  // Always load settings when component mounts or project changes
  useEffect(() => {
    loadSettings();
  }, [project.id, project.path]);

  // Listen for settings changes from ProjectTopBar for real-time updates
  useEffect(() => {
    const handleSettingsChanged = (e: Event) => {
      const customEvent = e as CustomEvent<{ projectId: string; projectPath: string }>;
      if (customEvent.detail.projectPath === project.path) {
        loadSettings(false); // Don't show loading indicator for live updates
      }
    };
    window.addEventListener("project-settings-changed", handleSettingsChanged);
    return () => window.removeEventListener("project-settings-changed", handleSettingsChanged);
  }, [project.path]);

  const projectCosts = useMemo(() => {
    const projectEntries = entries.filter((e) => e.projectId === project.id);
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
  }, [entries, project.id]);

  const storyStats = useMemo(() => {
    const completed = stories.filter((s) => s.passes).length;
    const total = stories.length;
    const pending = total - completed;
    return { completed, total, pending, progressPercent: total > 0 ? Math.round((completed / total) * 100) : 0 };
  }, [stories]);

  const agentName = settings?.agent
    ? defaultPlugins.find((p) => p.id === settings.agent)?.name || settings.agent
    : "Not configured";

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString(undefined, {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const formatTokens = (tokens: number) => {
    if (tokens >= 1000000) {
      return `${(tokens / 1000000).toFixed(2)}M`;
    }
    if (tokens >= 1000) {
      return `${(tokens / 1000).toFixed(1)}K`;
    }
    return tokens.toString();
  };

  return (
    <div className="flex-1 overflow-y-auto scrollbar-auto-hide p-6">
      <div className="max-w-3xl mx-auto space-y-6">
        {/* Build Settings Card */}
        <div className="bg-card rounded-xl border border-border overflow-hidden">
          <div className="px-6 py-4 border-b border-border bg-background-secondary flex items-center justify-between">
            <h2 className="text-base font-semibold text-foreground">Build Settings</h2>
            <div className="flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full ${
                buildStatus === "running" ? "bg-accent animate-pulse" :
                buildStatus === "paused" ? "bg-warning" : "bg-muted"
              }`} />
              <span className="text-xs text-secondary capitalize">{buildStatus}</span>
            </div>
          </div>
          <div className="p-6">
            {isLoading ? (
              <p className="text-sm text-muted">Loading settings...</p>
            ) : (
              <div className="grid grid-cols-3 gap-6">
                <div>
                  <label className="text-xs font-medium text-muted uppercase tracking-wider">Agent</label>
                  <p className="mt-1 text-sm text-foreground">{agentName}</p>
                </div>
                <div>
                  <label className="text-xs font-medium text-muted uppercase tracking-wider">Mode</label>
                  <p className="mt-1 text-sm text-foreground">
                    {settings?.buildMode ? buildModeLabels[settings.buildMode] : "Ralph (Sequential)"}
                  </p>
                </div>
                <div>
                  <label className="text-xs font-medium text-muted uppercase tracking-wider">Autonomy</label>
                  <p className="mt-1 text-sm text-foreground">
                    {settings?.autonomy ? autonomyLabels[settings.autonomy] : "Autonomous"}
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Story Progress Card */}
        <div className="bg-card rounded-xl border border-border overflow-hidden">
          <div className="px-6 py-4 border-b border-border bg-background-secondary">
            <h2 className="text-base font-semibold text-foreground">Story Progress</h2>
          </div>
          <div className="p-6">
            {stories.length === 0 ? (
              <p className="text-sm text-muted">No stories generated yet</p>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="text-center">
                      <p className="text-2xl font-bold text-foreground">{storyStats.completed}</p>
                      <p className="text-xs text-muted">Completed</p>
                    </div>
                    <div className="w-px h-8 bg-border" />
                    <div className="text-center">
                      <p className="text-2xl font-bold text-foreground">{storyStats.pending}</p>
                      <p className="text-xs text-muted">Pending</p>
                    </div>
                    <div className="w-px h-8 bg-border" />
                    <div className="text-center">
                      <p className="text-2xl font-bold text-foreground">{storyStats.total}</p>
                      <p className="text-xs text-muted">Total</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-bold text-accent">{storyStats.progressPercent}%</p>
                    <p className="text-xs text-muted">Complete</p>
                  </div>
                </div>
                <div className="h-2 bg-background rounded-full overflow-hidden">
                  <div
                    className="h-full bg-accent transition-all duration-300"
                    style={{ width: `${storyStats.progressPercent}%` }}
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Project Details Card */}
        <div className="bg-card rounded-xl border border-border overflow-hidden">
          <div className="px-6 py-4 border-b border-border bg-background-secondary">
            <h2 className="text-base font-semibold text-foreground">Project Details</h2>
          </div>
          <div className="p-6 space-y-4">
            {project.description && (
              <div>
                <label className="text-xs font-medium text-muted uppercase tracking-wider">Description</label>
                <p className="mt-1 text-sm text-secondary">{project.description}</p>
              </div>
            )}
            <div>
              <label className="text-xs font-medium text-muted uppercase tracking-wider">Path</label>
              <p className="mt-1 text-sm text-secondary font-mono text-xs">{project.path}</p>
            </div>
            <div>
              <label className="text-xs font-medium text-muted uppercase tracking-wider">Created</label>
              <p className="mt-1 text-sm text-secondary">{formatDate(project.createdAt)}</p>
            </div>
          </div>
        </div>

        {/* Usage & Costs Card */}
        <div className="bg-card rounded-xl border border-border overflow-hidden">
          <div className="px-6 py-4 border-b border-border bg-background-secondary">
            <h2 className="text-base font-semibold text-foreground">Usage & Costs</h2>
          </div>
          <div className="p-6">
            {projectCosts.entryCount === 0 ? (
              <p className="text-sm text-muted">No usage data yet</p>
            ) : (
              <div className="grid grid-cols-4 gap-6">
                <div>
                  <label className="text-xs font-medium text-muted uppercase tracking-wider">Total Cost</label>
                  <p className="mt-1 text-2xl font-bold text-accent">${projectCosts.totalCost.toFixed(2)}</p>
                </div>
                <div>
                  <label className="text-xs font-medium text-muted uppercase tracking-wider">Input Tokens</label>
                  <p className="mt-1 text-lg font-semibold text-foreground">{formatTokens(projectCosts.totalInputTokens)}</p>
                </div>
                <div>
                  <label className="text-xs font-medium text-muted uppercase tracking-wider">Output Tokens</label>
                  <p className="mt-1 text-lg font-semibold text-foreground">{formatTokens(projectCosts.totalOutputTokens)}</p>
                </div>
                <div>
                  <label className="text-xs font-medium text-muted uppercase tracking-wider">API Calls</label>
                  <p className="mt-1 text-lg font-semibold text-foreground">{projectCosts.entryCount}</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
