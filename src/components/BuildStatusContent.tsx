import { useMemo } from "react";
import { useBuildStore } from "../stores/buildStore";
import { usePrdStore, type Story } from "../stores/prdStore";

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
  // Subscribe directly to the project state to trigger re-renders when state changes
  const projectState = useBuildStore((state) => state.projectStates[projectId]);
  const stories = usePrdStore((state) => state.stories);
  const selectStory = usePrdStore((state) => state.selectStory);

  const buildStatus = projectState?.status ?? 'idle';
  const storyStatuses = projectState?.storyStatuses ?? {};
  const currentStoryId = projectState?.currentStoryId ?? null;
  const logs = projectState?.logs ?? [];

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

  const handleStoryClick = (storyId: string) => {
    selectStory(storyId);
  };

  return (
    <div className="flex-1 overflow-hidden flex">
      {/* Left: Story list */}
      <div className="w-80 border-r border-border flex flex-col">
        <div className="px-4 py-3 border-b border-border bg-background-secondary">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-foreground">Stories</span>
            <span className="text-xs text-muted">{progressPercent}%</span>
          </div>
          <div className="h-1.5 bg-card rounded-full overflow-hidden">
            <div
              className="h-full bg-accent transition-all duration-300"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
          <div className="mt-2 text-xs text-secondary">
            {completedCount}/{totalCount} complete
            {failedCount > 0 && <span className="text-destructive ml-1">({failedCount} failed)</span>}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto scrollbar-auto-hide">
          <ul className="divide-y divide-border">
            {storyProgress.map((story: StoryWithBuildStatus) => (
              <li key={story.id}>
                <button
                  onClick={() => handleStoryClick(story.id)}
                  className={`w-full px-4 py-3 text-left hover:bg-card/50 transition-colors ${
                    story.id === currentStoryId ? "bg-card/50" : ""
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
                      </div>
                      <p className="text-sm text-foreground truncate">{story.title}</p>
                    </div>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Right: Logs */}
      <div className="flex-1 flex flex-col">
        <div className="px-4 py-3 border-b border-border bg-background-secondary flex items-center justify-between">
          <span className="text-sm font-medium text-foreground">Build Log</span>
          <span className="text-xs text-muted">{logs.length} entries</span>
        </div>

        <div className="flex-1 overflow-y-auto scrollbar-auto-hide bg-background p-4">
          {logs.length === 0 ? (
            <div className="flex items-center justify-center h-full text-muted text-sm">
              {buildStatus === "idle" ? "Build not started" : "Waiting for logs..."}
            </div>
          ) : (
            <div className="font-mono text-xs space-y-1">
              {logs.map((log, i) => (
                <div
                  key={i}
                  className={`${
                    log.type === "stderr" ? "text-destructive" :
                    log.type === "system" ? "text-accent" :
                    "text-secondary"
                  }`}
                >
                  <span className="text-muted mr-2">[{log.timestamp.toISOString().slice(11, 19)}]</span>
                  {log.content}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Status bar */}
        <div className="px-4 py-2 border-t border-border bg-background-secondary flex items-center gap-4">
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
      </div>
    </div>
  );
}
