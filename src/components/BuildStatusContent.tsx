import { useMemo, useState, useEffect, useCallback, useRef } from "react";
import { open } from "@tauri-apps/plugin-shell";
import { invoke } from "@tauri-apps/api/core";
import { useBuildStore, type ConflictInfo } from "../stores/buildStore";
import { usePrdStore, type Story } from "../stores/prdStore";
import { useProjectStore } from "../stores/projectStore";
import { usePanelStore } from "../stores/panelStore";
import { analyzeStoryDependencies, getDependentsOf } from "../utils/storyDependencies";
import { DiffViewer } from "./DiffViewer";
import { FileViewer } from "./FileViewer";
import { ConflictResolver } from "./ConflictResolver";
import { StreamLogEntry } from "./StreamLogEntry";
import { defaultPlugins } from "../types";
import { 
  estimateBuildComplexity, 
  formatTokenEstimate, 
  getComplexityColor, 
  getComplexityBgColor,
  type BudgetLimits,
  checkBudgetLimits,
} from "../utils/storyComplexity";

interface StoryBranchInfo {
  branchName: string;
  storyId: string;
  status: "merged" | "unmerged" | "conflicted";
  isCurrent: boolean;
}

interface BuildStatusContentProps {
  projectId: string;
}

type StoryBuildStatus = "pending" | "in-progress" | "complete" | "failed";

interface StoryWithBuildStatus extends Story {
  buildStatus: StoryBuildStatus;
}

function getStatusIcon(status: StoryBuildStatus) {
  switch (status) {
    case "pending":
      return (
        <svg className="w-4 h-4 text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="10" strokeWidth={1.5} />
        </svg>
      );
    case "in-progress":
      return (
        <svg className="w-4 h-4 text-accent animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
        </svg>
      );
    case "complete":
      return (
        <svg className="w-4 h-4 text-success" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
      );
    case "failed":
      return (
        <svg className="w-4 h-4 text-destructive" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      );
  }
}

function getStatusLabel(status: StoryBuildStatus) {
  switch (status) {
    case "pending":
      return "Pending";
    case "in-progress":
      return "Building";
    case "complete":
      return "Complete";
    case "failed":
      return "Failed";
  }
}

export function BuildStatusContent({ projectId }: BuildStatusContentProps) {
  const [showDependencies, setShowDependencies] = useState(true);
  const [showBranches, setShowBranches] = useState(true);
  const [storyBranches, setStoryBranches] = useState<StoryBranchInfo[]>([]);
  const [branchesLoading, setBranchesLoading] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [confirmForceMerge, setConfirmForceMerge] = useState<string | null>(null);
  const [diffViewerStory, setDiffViewerStory] = useState<{ id: string; title: string; branchName?: string } | null>(null);
  const [conflictResolverBranch, setConflictResolverBranch] = useState<{ branchName: string; title: string } | null>(null);
  const [confirmRollback, setConfirmRollback] = useState<string | null>(null);
  const [rollingBack, setRollingBack] = useState<string | null>(null);
  const [retryAgentSelection, setRetryAgentSelection] = useState<Record<string, string>>({});
  const [budgetLimits, setBudgetLimits] = useState<BudgetLimits>({
    maxTokensPerStory: null,
    maxCostPerBuild: null,
    warnOnLargeStory: true,
  });
  
  const projectState = useBuildStore((state) => state.projectStates[projectId]);
  const projectPrd = usePrdStore((state) => state.projectPrds[projectId]);
  const stories = projectPrd?.stories ?? [];
  const selectStory = usePrdStore((state) => state.selectStory);
  const projects = useProjectStore((state) => state.projects);
  const project = projects.find(p => p.id === projectId);
  
  const panelState = usePanelStore((state) => state.getPanelState(projectId));
  const setSplitViewEnabled = usePanelStore((state) => state.setSplitViewEnabled);
  const setSplitViewWidth = usePanelStore((state) => state.setSplitViewWidth);
  const splitViewEnabled = panelState.splitViewEnabled;
  const splitViewWidth = panelState.splitViewWidth;
  
  const buildStatus = projectState?.status ?? 'idle';
  const storyStatuses = projectState?.storyStatuses ?? {};
  const storySnapshots = projectState?.storySnapshots ?? {};
  const currentStoryId = projectState?.currentStoryId ?? null;
  const logs = projectState?.logs ?? [];
  const conflictedBranches = projectState?.conflictedBranches ?? [];
  const clearStorySnapshot = useBuildStore((state) => state.clearStorySnapshot);
  const appendLog = useBuildStore((state) => state.appendLog);
  const reorderStories = usePrdStore((state) => state.reorderStories);
  const savePrd = usePrdStore((state) => state.savePrd);
  
  const [draggedStoryId, setDraggedStoryId] = useState<string | null>(null);
  const [dragOverStoryId, setDragOverStoryId] = useState<string | null>(null);
  const storyRefs = useRef<Map<string, HTMLLIElement>>(new Map());
  const listContainerRef = useRef<HTMLDivElement>(null);

  const loadBranches = useCallback(async () => {
    if (!project?.path) return;
    setBranchesLoading(true);
    try {
      const branches = await invoke<StoryBranchInfo[]>("list_story_branches", {
        projectPath: project.path,
      });
      setStoryBranches(branches);
    } catch (e) {
      console.error("Failed to load story branches:", e);
    } finally {
      setBranchesLoading(false);
    }
  }, [project?.path]);

  useEffect(() => {
    loadBranches();
  }, [loadBranches]);

  useEffect(() => {
    const loadBudgetLimits = async () => {
      try {
        const prefs = await invoke<{
          maxTokensPerStory?: number | null;
          maxCostPerBuild?: number | null;
          warnOnLargeStory?: boolean;
        } | null>("load_preferences");
        if (prefs) {
          setBudgetLimits({
            maxTokensPerStory: prefs.maxTokensPerStory ?? null,
            maxCostPerBuild: prefs.maxCostPerBuild ?? null,
            warnOnLargeStory: prefs.warnOnLargeStory ?? true,
          });
        }
      } catch (e) {
        console.error("Failed to load budget preferences:", e);
      }
    };
    loadBudgetLimits();
  }, []);

  const handleOpenProjectFolder = async () => {
    if (project?.path) {
      await open(project.path);
    }
  };

  const handleCheckoutBranch = async (branchName: string) => {
    if (!project?.path) return;
    try {
      await invoke("checkout_story_branch", {
        projectPath: project.path,
        branchName,
      });
      await loadBranches();
    } catch (e) {
      console.error("Failed to checkout branch:", e);
    }
  };

  const handleDeleteBranch = async (branchName: string, force: boolean) => {
    if (!project?.path) return;
    try {
      await invoke("delete_story_branch", {
        projectPath: project.path,
        branchName,
        force,
      });
      setConfirmDelete(null);
      await loadBranches();
    } catch (e) {
      console.error("Failed to delete branch:", e);
      alert(`Failed to delete branch: ${e}`);
      setConfirmDelete(null);
    }
  };

  const handleForceMerge = async (branchName: string) => {
    if (!project?.path) return;
    try {
      await invoke("force_merge_story_branch", {
        projectPath: project.path,
        branchName,
      });
      setConfirmForceMerge(null);
      await loadBranches();
    } catch (e) {
      console.error("Failed to force merge:", e);
    }
  };

  const dependencyGraph = useMemo(() => analyzeStoryDependencies(stories), [stories]);
  
  const hasDependencies = useMemo(() => 
    Object.values(dependencyGraph).some(d => d.prerequisites.length > 0), 
    [dependencyGraph]
  );

  const buildComplexity = useMemo(() => 
    estimateBuildComplexity(stories, dependencyGraph),
    [stories, dependencyGraph]
  );

  const storyProgress: StoryWithBuildStatus[] = useMemo(() => {
    return stories.map((story) => {
      let status: StoryBuildStatus = "pending";
      if (story.passes) {
        status = "complete";
      } else if (storyStatuses[story.id]) {
        status = storyStatuses[story.id];
      } else if (story.id === currentStoryId) {
        status = "in-progress";
      }
      return { ...story, buildStatus: status };
    });
  }, [stories, storyStatuses, currentStoryId]);

  const completedCount = storyProgress.filter((s: StoryWithBuildStatus) => s.buildStatus === "complete").length;
  const failedCount = storyProgress.filter((s: StoryWithBuildStatus) => s.buildStatus === "failed").length;
  const inProgressCount = storyProgress.filter((s: StoryWithBuildStatus) => s.buildStatus === "in-progress").length;
  const totalCount = stories.length;

  const progressPercent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  // Scroll to the current story when it starts building
  useEffect(() => {
    if (currentStoryId) {
      const storyElement = storyRefs.current.get(currentStoryId);
      if (storyElement && listContainerRef.current) {
        // Scroll the story into view, centered in the list
        storyElement.scrollIntoView({
          behavior: 'smooth',
          block: 'center',
        });
      }
    }
  }, [currentStoryId]);

  const handleStoryClick = (storyId: string) => {
    selectStory(projectId, storyId);
  };

  const isDragEnabled = buildStatus === 'idle';

  const handleDragStart = (e: React.DragEvent, storyId: string) => {
    if (!isDragEnabled) return;
    setDraggedStoryId(storyId);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", storyId);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };

  const handleDragEnter = (storyId: string) => {
    if (draggedStoryId && draggedStoryId !== storyId) {
      setDragOverStoryId(storyId);
    }
  };

  const handleDragLeave = () => {
    setDragOverStoryId(null);
  };

  const handleDrop = async (e: React.DragEvent, targetStoryId: string) => {
    e.preventDefault();
    if (!draggedStoryId || draggedStoryId === targetStoryId || !project?.path) {
      setDraggedStoryId(null);
      setDragOverStoryId(null);
      return;
    }

    const fromIndex = stories.findIndex((s) => s.id === draggedStoryId);
    const toIndex = stories.findIndex((s) => s.id === targetStoryId);

    if (fromIndex !== -1 && toIndex !== -1) {
      reorderStories(projectId, fromIndex, toIndex);
      await savePrd(project.id, project.path);
    }

    setDraggedStoryId(null);
    setDragOverStoryId(null);
  };

  const handleDragEnd = () => {
    setDraggedStoryId(null);
    setDragOverStoryId(null);
  };

  const handleRollback = async (storyId: string) => {
    if (!project?.path) return;
    const snapshot = storySnapshots[storyId];
    if (!snapshot) return;

    setRollingBack(storyId);
    try {
      await invoke("rollback_story_changes", {
        projectPath: project.path,
        snapshotRef: snapshot.snapshotRef,
        snapshotType: snapshot.snapshotType,
      });
      clearStorySnapshot(projectId, storyId);
      appendLog(projectId, "system", `✓ Rolled back changes for story ${storyId}`);
      setConfirmRollback(null);
    } catch (e) {
      console.error("Failed to rollback:", e);
      appendLog(projectId, "system", `✗ Failed to rollback story ${storyId}: ${e}`);
    } finally {
      setRollingBack(null);
    }
  };

  const handleRetryWithAgent = (storyId: string) => {
    const selectedAgent = retryAgentSelection[storyId];
    window.dispatchEvent(new CustomEvent('retry-story-with-agent', {
      detail: { projectId, storyId, agentId: selectedAgent }
    }));
  };

  return (
    <div className="flex-1 overflow-hidden flex">
      {/* Left: Story list */}
      <div className="w-80 border-r border-border flex flex-col">
        <div className="px-4 py-3 border-b border-border bg-background-secondary">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-foreground">Stories</span>
              {isDragEnabled && (
                <span className="text-[10px] text-muted flex items-center gap-1">
                  <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
                  </svg>
                  Drag to reorder
                </span>
              )}
            </div>
            <span className="text-xs text-muted">{progressPercent}%</span>
          </div>
          <div className="h-1.5 bg-card rounded-full overflow-hidden">
            <div
              className="h-full bg-accent transition-all duration-300"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
          <div className="mt-2 flex items-center justify-between">
            <span className="text-xs text-secondary">
              {completedCount}/{totalCount} complete
              {failedCount > 0 && <span className="text-destructive ml-1">({failedCount} failed)</span>}
            </span>
            <div className="flex items-center gap-2">
              <span 
                className="text-[10px] px-1.5 py-0.5 rounded bg-muted/10 text-muted"
                title={`Estimated tokens: ${buildComplexity.totalEstimatedTokens.toLocaleString()} (${buildComplexity.highComplexityCount} high, ${buildComplexity.mediumComplexityCount} medium, ${buildComplexity.lowComplexityCount} low complexity)`}
              >
                ~{formatTokenEstimate(buildComplexity.totalEstimatedTokens)} total
              </span>
              {hasDependencies && (
                <button
                  onClick={() => setShowDependencies(!showDependencies)}
                  className={`text-[10px] px-1.5 py-0.5 rounded transition-colors ${
                    showDependencies 
                      ? "bg-accent/20 text-accent" 
                      : "bg-muted/10 text-muted hover:bg-muted/20"
                  }`}
                  title={showDependencies ? "Hide dependencies" : "Show dependencies"}
                >
                  <span className="flex items-center gap-1">
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                    </svg>
                    Deps
                  </span>
                </button>
              )}
            </div>
          </div>
        </div>

        <div ref={listContainerRef} className="flex-1 overflow-y-auto scrollbar-auto-hide">
          <ul className="divide-y divide-border">
            {storyProgress.map((story: StoryWithBuildStatus) => {
              const deps = dependencyGraph[story.id];
              const prerequisites = deps?.prerequisites ?? [];
              const dependents = getDependentsOf(dependencyGraph, story.id);
              
              return (
                <li 
                  key={story.id}
                  ref={(el) => {
                    if (el) {
                      storyRefs.current.set(story.id, el);
                    } else {
                      storyRefs.current.delete(story.id);
                    }
                  }}
                  draggable={isDragEnabled}
                  onDragStart={(e) => handleDragStart(e, story.id)}
                  onDragOver={handleDragOver}
                  onDragEnter={() => handleDragEnter(story.id)}
                  onDragLeave={handleDragLeave}
                  onDrop={(e) => handleDrop(e, story.id)}
                  onDragEnd={handleDragEnd}
                  className={`${
                    draggedStoryId === story.id 
                      ? "opacity-50" 
                      : dragOverStoryId === story.id 
                        ? "bg-accent/10 ring-2 ring-accent/30 ring-inset" 
                        : ""
                  }`}
                >
                  <div
                    onClick={() => handleStoryClick(story.id)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleStoryClick(story.id); }}
                    className={`w-full px-4 py-3 text-left hover:bg-card/50 transition-colors cursor-pointer ${
                      story.buildStatus === "in-progress" 
                        ? "bg-accent/5 border-l-2 border-accent" 
                        : story.id === currentStoryId 
                          ? "bg-card/50" 
                          : ""
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div className="flex-shrink-0 mt-0.5">
                        {getStatusIcon(story.buildStatus)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="text-xs font-mono text-accent">{story.id}</span>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                            story.buildStatus === "complete" ? "bg-success/10 text-success" :
                            story.buildStatus === "failed" ? "bg-destructive/10 text-destructive" :
                            story.buildStatus === "in-progress" ? "bg-accent/10 text-accent" :
                            "bg-muted/10 text-muted"
                          }`}>
                            {getStatusLabel(story.buildStatus)}
                          </span>
                          {(() => {
                            const estimate = buildComplexity.storyEstimates[story.id];
                            if (!estimate) return null;
                            const budgetCheck = checkBudgetLimits(estimate, budgetLimits);
                            const showWarning = budgetCheck.exceedsLimit || (budgetLimits.warnOnLargeStory && estimate.level === 'high');
                            return (
                              <span 
                                className={`text-[10px] px-1.5 py-0.5 rounded ${getComplexityBgColor(estimate.level)} ${getComplexityColor(estimate.level)}`}
                                title={`~${formatTokenEstimate(estimate.estimatedTokens)} tokens${budgetCheck.warningMessage ? ` - ${budgetCheck.warningMessage}` : ''}`}
                              >
                                {showWarning && (
                                  <svg className="w-2.5 h-2.5 inline mr-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                  </svg>
                                )}
                                {formatTokenEstimate(estimate.estimatedTokens)}
                              </span>
                            );
                          })()}
                        </div>
                        <p className="text-sm text-foreground truncate">{story.title}</p>
                        
                        {showDependencies && (prerequisites.length > 0 || dependents.length > 0) && (
                          <div className="mt-1.5 flex flex-wrap gap-1">
                            {prerequisites.map(prereqId => {
                              const prereqStory = storyProgress.find(s => s.id === prereqId);
                              const isComplete = prereqStory?.buildStatus === "complete";
                              return (
                                <span
                                  key={prereqId}
                                  className={`inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded ${
                                    isComplete 
                                      ? "bg-success/10 text-success" 
                                      : "bg-warning/10 text-warning"
                                  }`}
                                  title={`Depends on: ${prereqStory?.title ?? prereqId}`}
                                >
                                  <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
                                  </svg>
                                  {prereqId}
                                </span>
                              );
                            })}
                            {dependents.map(depId => (
                              <span
                                key={depId}
                                className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded bg-accent/10 text-accent"
                                title={`Blocks: ${storyProgress.find(s => s.id === depId)?.title ?? depId}`}
                              >
                                <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7" />
                                </svg>
                                {depId}
                              </span>
                            ))}
                          </div>
                        )}
                        
                        {/* View Changes button for in-progress or completed stories */}
                        {(story.buildStatus === "in-progress" || story.buildStatus === "complete") && storyBranches.some(b => b.storyId === story.id.toLowerCase().replace(/[^a-z0-9-_]/g, '-')) && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setDiffViewerStory({ id: story.id, title: story.title });
                            }}
                            className="mt-1.5 inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-accent/10 text-accent hover:bg-accent/20 transition-colors"
                            title="View file changes"
                          >
                            <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                            View Changes
                          </button>
                        )}
                        
                        {/* Rollback button for failed stories with snapshots */}
                        {story.buildStatus === "failed" && storySnapshots[story.id] && (
                          <div className="mt-1.5">
                            {confirmRollback === story.id ? (
                              <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                                <span className="text-[10px] text-destructive mr-1">Revert all changes?</span>
                                <button
                                  onClick={() => handleRollback(story.id)}
                                  disabled={rollingBack === story.id}
                                  className="text-[10px] px-1.5 py-0.5 rounded bg-destructive text-white font-medium hover:bg-destructive/80 transition-colors disabled:opacity-50"
                                >
                                  {rollingBack === story.id ? "Rolling back..." : "Confirm"}
                                </button>
                                <button
                                  onClick={() => setConfirmRollback(null)}
                                  className="text-[10px] px-1.5 py-0.5 rounded bg-muted/20 text-muted hover:bg-muted/30 transition-colors"
                                >
                                  Cancel
                                </button>
                              </div>
                            ) : (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setConfirmRollback(story.id);
                                }}
                                className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-warning/10 text-warning hover:bg-warning/20 transition-colors"
                                title="Rollback to pre-story state"
                              >
                                <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                                </svg>
                                Rollback
                              </button>
                            )}
                          </div>
                        )}
                        
                        {/* Retry with different agent for failed stories */}
                        {story.buildStatus === "failed" && (
                          <div className="mt-1.5 flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                            <select
                              value={retryAgentSelection[story.id] || ""}
                              onChange={(e) => setRetryAgentSelection(prev => ({ ...prev, [story.id]: e.target.value }))}
                              className="text-[10px] px-1.5 py-0.5 rounded bg-background border border-border text-foreground"
                            >
                              <option value="">Default agent</option>
                              {defaultPlugins.map(plugin => (
                                <option key={plugin.id} value={plugin.id}>{plugin.name}</option>
                              ))}
                            </select>
                            <button
                              onClick={() => handleRetryWithAgent(story.id)}
                              className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-accent/10 text-accent hover:bg-accent/20 transition-colors"
                              title="Retry story with selected agent"
                            >
                              <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                              </svg>
                              Retry
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      </div>

      {/* Right: Logs and Conflicts */}
      <div className="flex-1 flex flex-col">
        {/* Conflicts Section */}
        {conflictedBranches.length > 0 && (
          <div className="border-b border-border bg-destructive/5">
            <div className="px-4 py-3 border-b border-destructive/20 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <svg className="w-4 h-4 text-destructive" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <span className="text-sm font-medium text-destructive">Merge Conflicts</span>
                <span className="text-xs text-destructive/70">({conflictedBranches.length})</span>
              </div>
              <button
                onClick={handleOpenProjectFolder}
                className="text-xs px-2 py-1 rounded bg-destructive/10 text-destructive hover:bg-destructive/20 transition-colors flex items-center gap-1"
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 19a2 2 0 01-2-2V7a2 2 0 012-2h4l2 2h4a2 2 0 012 2v1M5 19h14a2 2 0 002-2v-5a2 2 0 00-2-2H9a2 2 0 00-2 2v5a2 2 0 01-2 2z" />
                </svg>
                Open Folder
              </button>
            </div>
            <div className="px-4 py-2 space-y-3 max-h-64 overflow-y-auto">
              {conflictedBranches.map((conflict: ConflictInfo) => (
                <div key={conflict.branchName} className="bg-background rounded-lg p-3 border border-destructive/20">
                  <div className="flex items-start gap-2 text-sm">
                    <span className="text-destructive font-mono text-xs bg-destructive/10 px-1.5 py-0.5 rounded flex-shrink-0">
                      {conflict.storyId}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-foreground truncate font-medium">{conflict.storyTitle}</p>
                      <p className="text-xs text-muted mt-0.5">
                        Branch: <code className="text-destructive">{conflict.branchName}</code>
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 mt-3">
                    <button
                      onClick={() => {
                        setDiffViewerStory({ id: conflict.storyId, title: conflict.storyTitle, branchName: conflict.branchName });
                      }}
                      className="text-xs px-2 py-1 rounded bg-accent/10 text-accent hover:bg-accent/20 transition-colors flex items-center gap-1"
                    >
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                      </svg>
                      View Diff
                    </button>
                    <button
                      onClick={async () => {
                        if (!confirm(`Force merge "${conflict.branchName}"? This will accept all changes from the story branch, overwriting any conflicts.`)) return;
                        try {
                          await invoke("force_merge_story_branch", {
                            projectPath: project?.path,
                            branchName: conflict.branchName,
                          });
                          useBuildStore.getState().removeConflictedBranch(projectId, conflict.branchName);
                          loadBranches();
                        } catch (e) {
                          console.error("Failed to force merge:", e);
                          alert(`Failed to force merge: ${e}`);
                        }
                      }}
                      className="text-xs px-2 py-1 rounded bg-warning/10 text-warning hover:bg-warning/20 transition-colors flex items-center gap-1"
                    >
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      Force Merge
                    </button>
                    <button
                      onClick={async () => {
                        if (!confirm(`Delete branch "${conflict.branchName}"? This will discard all changes from this story.`)) return;
                        try {
                          await invoke("delete_story_branch", {
                            projectPath: project?.path,
                            branchName: conflict.branchName,
                            force: true,
                          });
                          useBuildStore.getState().removeConflictedBranch(projectId, conflict.branchName);
                          loadBranches();
                        } catch (e) {
                          console.error("Failed to delete branch:", e);
                          alert(`Failed to delete branch: ${e}`);
                        }
                      }}
                      className="text-xs px-2 py-1 rounded bg-destructive/10 text-destructive hover:bg-destructive/20 transition-colors flex items-center gap-1"
                    >
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                      Discard
                    </button>
                    <button
                      onClick={async () => {
                        if (!confirm(`Checkout branch "${conflict.branchName}"? This will abort any pending merge and reset uncommitted changes.`)) return;
                        try {
                          await invoke("checkout_story_branch", {
                            projectPath: project?.path,
                            branchName: conflict.branchName,
                          });
                          await loadBranches();
                          handleOpenProjectFolder();
                        } catch (e) {
                          console.error("Failed to checkout:", e);
                          alert(`Failed to checkout: ${e}`);
                        }
                      }}
                      className="text-xs px-2 py-1 rounded bg-secondary/10 text-secondary hover:bg-secondary/20 transition-colors flex items-center gap-1"
                    >
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                      </svg>
                      Checkout
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Story Branches Section */}
        <div className="border-b border-border">
          <button
            onClick={() => setShowBranches(!showBranches)}
            className="w-full px-4 py-3 bg-background-secondary flex items-center justify-between hover:bg-card/50 transition-colors"
          >
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              <span className="text-sm font-medium text-foreground">Story Branches</span>
              {storyBranches.length > 0 && (
                <span className="text-xs text-muted">({storyBranches.length})</span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  loadBranches();
                }}
                className="text-xs px-2 py-1 rounded bg-accent/10 text-accent hover:bg-accent/20 transition-colors"
                disabled={branchesLoading}
              >
                {branchesLoading ? "Loading..." : "Refresh"}
              </button>
              <svg
                className={`w-4 h-4 text-muted transition-transform ${showBranches ? "rotate-180" : ""}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </div>
          </button>
          {showBranches && (
            <div className="max-h-48 overflow-y-auto scrollbar-auto-hide">
              {storyBranches.length === 0 ? (
                <div className="px-4 py-3 text-sm text-muted text-center">
                  No story branches found
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {storyBranches.map((branch) => (
                    <div
                      key={branch.branchName}
                      className="px-4 py-2 flex items-center justify-between hover:bg-card/30"
                    >
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <span
                          className={`w-2 h-2 rounded-full flex-shrink-0 ${
                            branch.status === "merged"
                              ? "bg-success"
                              : branch.status === "conflicted"
                              ? "bg-destructive"
                              : "bg-warning"
                          }`}
                          title={branch.status}
                        />
                        <span className="font-mono text-xs text-foreground truncate">
                          {branch.branchName}
                        </span>
                        {branch.isCurrent && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-accent/20 text-accent flex-shrink-0">
                            current
                          </span>
                        )}
                        <span
                          className={`text-[10px] px-1.5 py-0.5 rounded flex-shrink-0 ${
                            branch.status === "merged"
                              ? "bg-success/10 text-success"
                              : branch.status === "conflicted"
                              ? "bg-destructive/10 text-destructive"
                              : "bg-warning/10 text-warning"
                          }`}
                        >
                          {branch.status}
                        </span>
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0 ml-2">
                        {branch.status !== "merged" && (
                          <button
                            onClick={() => setDiffViewerStory({ id: branch.storyId, title: branch.branchName, branchName: branch.branchName })}
                            className="p-1 rounded hover:bg-accent/20 text-muted hover:text-accent transition-colors"
                            title="View diff"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                          </button>
                        )}
                        {!branch.isCurrent && (
                          <button
                            onClick={() => handleCheckoutBranch(branch.branchName)}
                            className="p-1 rounded hover:bg-accent/20 text-muted hover:text-accent transition-colors"
                            title="Checkout branch"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                            </svg>
                          </button>
                        )}
                        {branch.status !== "merged" && !branch.isCurrent && (
                          <>
                            <button
                              onClick={() => setConflictResolverBranch({ branchName: branch.branchName, title: branch.storyId })}
                              className="p-1 rounded hover:bg-success/20 text-muted hover:text-success transition-colors"
                              title="Resolve conflicts and merge"
                            >
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                              </svg>
                            </button>
                            {confirmForceMerge === branch.branchName ? (
                              <div className="flex items-center gap-1">
                                <button
                                  onClick={() => handleForceMerge(branch.branchName)}
                                  className="text-[10px] px-1.5 py-0.5 rounded bg-warning text-background font-medium"
                                >
                                  Confirm
                                </button>
                                <button
                                  onClick={() => setConfirmForceMerge(null)}
                                  className="text-[10px] px-1.5 py-0.5 rounded bg-muted/20 text-muted"
                                >
                                  Cancel
                                </button>
                              </div>
                            ) : (
                              <button
                                onClick={() => setConfirmForceMerge(branch.branchName)}
                                className="p-1 rounded hover:bg-warning/20 text-muted hover:text-warning transition-colors"
                                title="Force merge (accepts theirs on conflicts)"
                              >
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                                </svg>
                              </button>
                            )}
                          </>
                        )}
                        {!branch.isCurrent && (
                          <>
                            {confirmDelete === branch.branchName ? (
                              <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDeleteBranch(branch.branchName, true);
                                  }}
                                  className="text-[10px] px-1.5 py-0.5 rounded bg-destructive text-white font-medium"
                                >
                                  Delete
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setConfirmDelete(null);
                                  }}
                                  className="text-[10px] px-1.5 py-0.5 rounded bg-muted/20 text-muted"
                                >
                                  Cancel
                                </button>
                              </div>
                            ) : (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setConfirmDelete(branch.branchName);
                                }}
                                className="p-1 rounded hover:bg-destructive/20 text-muted hover:text-destructive transition-colors"
                                title="Delete branch"
                              >
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="px-4 py-3 border-b border-border bg-background-secondary flex items-center justify-between">
          <span className="text-sm font-medium text-foreground">Build Log</span>
          <span className="text-xs text-muted">{logs.length} entries</span>
        </div>

        <div className="flex-1 overflow-y-auto scrollbar-auto-hide bg-background p-4 select-text">
          {logs.length === 0 ? (
            <div className="flex items-center justify-center h-full text-muted text-sm">
              {buildStatus === "idle" ? "Build not started" : "Waiting for logs..."}
            </div>
          ) : (
            <div className="font-mono text-xs space-y-1">
              {logs.map((log, i) => (
                <StreamLogEntry
                  key={i}
                  content={log.content}
                  timestamp={log.timestamp}
                  type={log.type}
                />
              ))}
            </div>
          )}
        </div>

        {/* Status bar */}
        <div className="px-4 py-2 border-t border-border bg-background-secondary flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full ${
                buildStatus === "running" ? "bg-accent animate-pulse" :
                buildStatus === "paused" ? "bg-warning" : "bg-muted"
              }`} />
              <span className="text-xs text-secondary capitalize">{buildStatus}</span>
            </div>
            {inProgressCount > 0 && (
              <span className="text-xs text-muted">
                Currently building: {storyProgress.find((s: StoryWithBuildStatus) => s.buildStatus === "in-progress")?.title}
              </span>
            )}
          </div>
          <button
            onClick={() => setSplitViewEnabled(projectId, !splitViewEnabled)}
            className={`flex items-center gap-1.5 text-xs px-2 py-1 rounded transition-colors ${
              splitViewEnabled
                ? "bg-accent/20 text-accent"
                : "bg-muted/10 text-muted hover:bg-muted/20"
            }`}
            title={splitViewEnabled ? "Hide file viewer" : "Show file viewer"}
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" />
            </svg>
            Files
          </button>
        </div>
      </div>

      {/* Split View - File Viewer */}
      {splitViewEnabled && project?.path && (
        <>
          <div
            className="w-1 bg-border hover:bg-accent/50 cursor-col-resize transition-colors flex-shrink-0"
            onMouseDown={(e) => {
              e.preventDefault();
              const startX = e.clientX;
              const startWidth = splitViewWidth;
              
              const handleMouseMove = (moveEvent: MouseEvent) => {
                const delta = startX - moveEvent.clientX;
                const newWidth = Math.min(Math.max(startWidth + delta, 300), 800);
                setSplitViewWidth(projectId, newWidth);
              };
              
              const handleMouseUp = () => {
                document.removeEventListener("mousemove", handleMouseMove);
                document.removeEventListener("mouseup", handleMouseUp);
              };
              
              document.addEventListener("mousemove", handleMouseMove);
              document.addEventListener("mouseup", handleMouseUp);
            }}
          />
          <div style={{ width: splitViewWidth }} className="flex-shrink-0">
            <FileViewer
              projectPath={project.path}
              onClose={() => setSplitViewEnabled(projectId, false)}
            />
          </div>
        </>
      )}

      {/* Diff Viewer Modal */}
      {project?.path && diffViewerStory && (
        <DiffViewer
          isOpen={!!diffViewerStory}
          onClose={() => setDiffViewerStory(null)}
          projectPath={project.path}
          storyId={diffViewerStory.id}
          storyTitle={diffViewerStory.title}
          branchName={diffViewerStory.branchName}
        />
      )}

      {/* Conflict Resolver Modal */}
      {project?.path && conflictResolverBranch && (
        <ConflictResolver
          isOpen={!!conflictResolverBranch}
          onClose={() => setConflictResolverBranch(null)}
          onResolved={() => {
            loadBranches();
            useBuildStore.getState().removeConflictedBranch(projectId, conflictResolverBranch.branchName);
          }}
          projectPath={project.path}
          branchName={conflictResolverBranch.branchName}
          storyTitle={conflictResolverBranch.title}
        />
      )}
    </div>
  );
}
