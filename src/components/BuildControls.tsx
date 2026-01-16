import { useState } from "react";
import { useBuildStore } from "../stores/buildStore";
import { usePrdStore } from "../stores/prdStore";
import { useBuildLoop } from "../hooks/useBuildLoop";
import { usePrdGeneration } from "../hooks/usePrdGeneration";
import { useProjectStore } from "../stores/projectStore";

interface BuildControlsProps {
  projectId: string;
  projectPath: string;
}

export function BuildControls({ projectId, projectPath }: BuildControlsProps) {
  // Subscribe directly to the project state for reactivity
  const projectState = useBuildStore((state) => state.projectStates[projectId]);
  const pauseBuild = useBuildStore((state) => state.pauseBuild);
  
  const status = projectState?.status ?? 'idle';
  const currentStoryId = projectState?.currentStoryId ?? null;

  const stories = usePrdStore((state) => state.stories);
  const project = useProjectStore((state) => 
    state.projects.find((p) => p.id === projectId)
  );

  const { handleStart, handleResume, handleCancel } = useBuildLoop(projectId, projectPath);
  const { breakdownStories } = usePrdGeneration();
  
  const [isBreakingDown, setIsBreakingDown] = useState(false);

  const hasIncompleteStories = stories.some((s) => !s.passes);
  const hasStories = stories.length > 0;
  const canStart = hasStories && hasIncompleteStories && status === "idle";
  
  const handleBreakdownStories = async () => {
    if (!project) return;
    setIsBreakingDown(true);
    try {
      await breakdownStories(projectId, project.name, projectPath);
    } finally {
      setIsBreakingDown(false);
    }
  };

  const PlayIcon = () => (
    <svg
      className="w-4 h-4"
      fill="currentColor"
      viewBox="0 0 24 24"
    >
      <path d="M8 5v14l11-7z" />
    </svg>
  );

  const PauseIcon = () => (
    <svg
      className="w-4 h-4"
      fill="currentColor"
      viewBox="0 0 24 24"
    >
      <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
    </svg>
  );

  const StopIcon = () => (
    <svg
      className="w-4 h-4"
      fill="currentColor"
      viewBox="0 0 24 24"
    >
      <path d="M6 6h12v12H6z" />
    </svg>
  );

  const currentStory = currentStoryId 
    ? stories.find((s) => s.id === currentStoryId) 
    : null;

  if (status === "idle") {
    return (
      <div className="flex items-center gap-2">
        <button
          onClick={handleStart}
          disabled={!canStart}
          className="btn btn-primary"
        >
          <PlayIcon />
          Start Build
        </button>
        {hasStories && (
          <button
            onClick={handleBreakdownStories}
            disabled={isBreakingDown}
            className="btn btn-secondary"
            title="Break down complex stories into smaller, more manageable pieces"
          >
            {isBreakingDown ? (
              <>
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Breaking Down...
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16m-7 6h7" />
                </svg>
                Refine Stories
              </>
            )}
          </button>
        )}
        {!hasStories && (
          <span className="text-sm text-muted">No stories to build</span>
        )}
        {hasStories && !hasIncompleteStories && (
          <span className="text-sm text-success flex items-center gap-1.5">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            All stories complete
          </span>
        )}
      </div>
    );
  }

  if (status === "running") {
    return (
      <div className="flex items-center gap-2">
        <button
          onClick={() => pauseBuild(projectId)}
          className="btn btn-secondary"
        >
          <PauseIcon />
          Pause
        </button>
        <button
          onClick={() => handleCancel()}
          className="btn btn-ghost text-destructive hover:bg-destructive/10"
        >
          <StopIcon />
          Cancel
        </button>
        <span className="text-sm text-secondary">
          {currentStory 
            ? <><span className="pill mr-1.5">{currentStory.id}</span>{currentStory.title}</>
            : 'Build in progress...'}
        </span>
      </div>
    );
  }

  if (status === "paused") {
    return (
      <div className="flex items-center gap-2">
        <button
          onClick={handleResume}
          className="btn btn-primary"
        >
          <PlayIcon />
          Resume
        </button>
        <button
          onClick={() => handleCancel()}
          className="btn btn-ghost text-destructive hover:bg-destructive/10"
        >
          <StopIcon />
          Cancel
        </button>
        <span className="text-sm text-muted">Build paused</span>
      </div>
    );
  }

  return null;
}
