import type { Story } from "../stores/prdStore";
import { useBuildStore, type StoryBuildStatus } from "../stores/buildStore";

interface StoryCardProps {
  story: Story;
  isSelected?: boolean;
  onClick: (storyId: string) => void;
  onEdit: (story: Story) => void;
  onDelete: (story: Story) => void;
}

function getStoryStatus(story: Story, buildStatus: StoryBuildStatus | undefined): StoryBuildStatus {
  if (buildStatus) {
    return buildStatus;
  }
  if (story.passes) {
    return "complete";
  }
  return "pending";
}

const statusColors: Record<StoryBuildStatus, string> = {
  pending: "bg-secondary/20 text-secondary",
  "in-progress": "bg-blue-500/20 text-blue-500",
  complete: "bg-green-500/20 text-green-500",
  failed: "bg-red-500/20 text-red-500",
};

const statusLabels: Record<StoryBuildStatus, string> = {
  pending: "Pending",
  "in-progress": "In Progress",
  complete: "Complete",
  failed: "Failed",
};

export function StoryCard({ story, isSelected = false, onClick, onEdit, onDelete }: StoryCardProps) {
  const storyStatuses = useBuildStore((state) => state.storyStatuses);
  const buildStatus = storyStatuses[story.id];
  const status = getStoryStatus(story, buildStatus);
  const criteriaCount = story.acceptanceCriteria.length;
  const isInProgress = status === "in-progress";

  const handleClick = () => {
    onClick(story.id);
  };

  const handleEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    onEdit(story);
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    onDelete(story);
  };

  return (
    <div
      className={`border rounded-xl bg-card p-4 cursor-pointer transition-colors ${
        isInProgress 
          ? "border-blue-500 ring-2 ring-blue-500/20" 
          : isSelected 
            ? "border-accent ring-2 ring-accent/20" 
            : "border-border hover:border-accent/50"
      }`}
      onClick={handleClick}
    >
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="flex items-center gap-2">
          <span className="px-2 py-0.5 text-xs font-medium bg-accent/10 text-accent rounded">
            {story.id}
          </span>
          <h3 className="font-medium text-foreground">{story.title}</h3>
          {isInProgress && (
            <span className="flex items-center gap-1 text-xs text-blue-500">
              <svg className="w-3 h-3 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              Building...
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span
            className={`px-2 py-0.5 text-xs font-medium rounded ${statusColors[status]}`}
          >
            {statusLabels[status]}
          </span>
          <button
            onClick={handleEdit}
            className="p-1 rounded hover:bg-accent/10 text-secondary hover:text-accent transition-colors"
            aria-label="Edit story"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
              <path d="m15 5 4 4" />
            </svg>
          </button>
          <button
            onClick={handleDelete}
            className="p-1 rounded hover:bg-red-500/10 text-secondary hover:text-red-500 transition-colors"
            aria-label="Delete story"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M3 6h18" />
              <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
              <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
              <line x1="10" y1="11" x2="10" y2="17" />
              <line x1="14" y1="11" x2="14" y2="17" />
            </svg>
          </button>
        </div>
      </div>

      <p className="text-sm text-secondary line-clamp-2 mb-3">
        {story.description}
      </p>
      <div className="text-xs text-secondary">
        {criteriaCount} {criteriaCount === 1 ? "criterion" : "criteria"}
      </div>
    </div>
  );
}
