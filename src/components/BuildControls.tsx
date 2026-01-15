import { useBuildStore } from "../stores/buildStore";
import { usePrdStore } from "../stores/prdStore";
import { useBuildLoop } from "../hooks/useBuildLoop";

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

  const { handleStart, handleResume, handleCancel } = useBuildLoop(projectId, projectPath);

  const hasIncompleteStories = stories.some((s) => !s.passes);
  const hasStories = stories.length > 0;
  const canStart = hasStories && hasIncompleteStories && status === "idle";

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
          onClick={handleCancel}
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
          onClick={handleCancel}
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
