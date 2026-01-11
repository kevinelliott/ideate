import { useBuildStore } from "../stores/buildStore";
import { usePrdStore } from "../stores/prdStore";
import { useBuildLoop } from "../hooks/useBuildLoop";

interface BuildControlsProps {
  projectPath: string;
}

export function BuildControls({ projectPath }: BuildControlsProps) {
  const status = useBuildStore((state) => state.status);
  const pauseBuild = useBuildStore((state) => state.pauseBuild);
  const currentStoryId = useBuildStore((state) => state.currentStoryId);

  const stories = usePrdStore((state) => state.stories);

  const { handleStart, handleResume, handleCancel } = useBuildLoop(projectPath);

  const hasIncompleteStories = stories.some((s) => !s.passes);
  const hasStories = stories.length > 0;
  const canStart = hasStories && hasIncompleteStories && status === "idle";

  const buttonBaseClasses =
    "px-4 py-2 rounded-lg font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed";

  const PlayIcon = () => (
    <svg
      className="w-4 h-4 mr-2"
      fill="currentColor"
      viewBox="0 0 24 24"
    >
      <path d="M8 5v14l11-7z" />
    </svg>
  );

  const PauseIcon = () => (
    <svg
      className="w-4 h-4 mr-2"
      fill="currentColor"
      viewBox="0 0 24 24"
    >
      <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
    </svg>
  );

  const StopIcon = () => (
    <svg
      className="w-4 h-4 mr-2"
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
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={handleStart}
          disabled={!canStart}
          className={`${buttonBaseClasses} bg-accent text-white hover:opacity-90 flex items-center`}
        >
          <PlayIcon />
          Start Build
        </button>
        {!hasStories && (
          <span className="text-sm text-secondary">No stories to build</span>
        )}
        {hasStories && !hasIncompleteStories && (
          <span className="text-sm text-green-500">All stories complete</span>
        )}
      </div>
    );
  }

  if (status === "running") {
    return (
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={pauseBuild}
          className={`${buttonBaseClasses} bg-yellow-500/20 text-yellow-500 hover:bg-yellow-500/30 flex items-center`}
        >
          <PauseIcon />
          Pause
        </button>
        <button
          onClick={handleCancel}
          className={`${buttonBaseClasses} bg-red-500/20 text-red-500 hover:bg-red-500/30 flex items-center`}
        >
          <StopIcon />
          Cancel
        </button>
        <span className="text-sm text-secondary">
          {currentStory 
            ? `Building: ${currentStory.id} - ${currentStory.title}`
            : 'Build in progress...'}
        </span>
      </div>
    );
  }

  if (status === "paused") {
    return (
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={handleResume}
          className={`${buttonBaseClasses} bg-accent text-white hover:opacity-90 flex items-center`}
        >
          <PlayIcon />
          Resume
        </button>
        <button
          onClick={handleCancel}
          className={`${buttonBaseClasses} bg-red-500/20 text-red-500 hover:bg-red-500/30 flex items-center`}
        >
          <StopIcon />
          Cancel
        </button>
        <span className="text-sm text-secondary">Build paused</span>
      </div>
    );
  }

  return null;
}
