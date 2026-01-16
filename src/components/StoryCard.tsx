import { useEffect, useRef } from "react";
import type { Story } from "../stores/prdStore";
import { useBuildStore, type StoryBuildStatus } from "../stores/buildStore";

interface StoryCardProps {
  projectId: string;
  story: Story;
  isSelected?: boolean;
  isDragging?: boolean;
  isDragOver?: boolean;
  onClick: (storyId: string) => void;
  onEdit: (story: Story) => void;
  onDelete: (story: Story) => void;
  onRetry?: (story: Story) => void;
  onPlay?: (story: Story) => void;
  onPause?: () => void;
  onDragStart?: (e: React.DragEvent, story: Story) => void;
  onDragOver?: (e: React.DragEvent) => void;
  onDragLeave?: (e: React.DragEvent) => void;
  onDrop?: (e: React.DragEvent, story: Story) => void;
  onDragEnd?: (e: React.DragEvent) => void;
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
  pending: "bg-border text-muted",
  "in-progress": "bg-accent/15 text-accent",
  complete: "bg-success/15 text-success",
  failed: "bg-destructive/15 text-destructive",
};

const statusLabels: Record<StoryBuildStatus, string> = {
  pending: "Pending",
  "in-progress": "In Progress",
  complete: "Complete",
  failed: "Failed",
};

export function StoryCard({ 
  projectId, 
  story, 
  isSelected = false, 
  isDragging = false,
  isDragOver = false,
  onClick, 
  onEdit, 
  onDelete, 
  onRetry,
  onPlay,
  onPause,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
  onDragEnd,
}: StoryCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  
  const projectState = useBuildStore((state) => state.projectStates[projectId]);
  const storyStatuses = projectState?.storyStatuses ?? {};
  const storyRetries = projectState?.storyRetries ?? {};
  const buildRunning = projectState?.status === 'running';
  
  const buildStatus = storyStatuses[story.id];
  const retryInfo = storyRetries[story.id];
  const status = getStoryStatus(story, buildStatus);
  const criteriaCount = story.acceptanceCriteria.length;
  const isInProgress = status === "in-progress";
  const isFailed = status === "failed";
  const isPending = status === "pending";
  const retryCount = retryInfo?.retryCount ?? 0;

  // Can play if: pending/failed and build is not running
  const canPlay = (isPending || isFailed) && !buildRunning;
  // Can pause if: this story is in progress and build is running
  const canPause = isInProgress && buildRunning;

  // Auto-scroll to keep the in-progress story visible
  useEffect(() => {
    if (isInProgress && cardRef.current) {
      cardRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
      });
    }
  }, [isInProgress]);

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

  const handleRetry = (e: React.MouseEvent) => {
    e.stopPropagation();
    onRetry?.(story);
  };

  const handlePlayPause = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (canPause) {
      onPause?.();
    } else if (canPlay) {
      onPlay?.(story);
    }
  };

  return (
    <div
      ref={cardRef}
      draggable={!!onDragStart}
      onDragStart={onDragStart ? (e) => onDragStart(e, story) : undefined}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop ? (e) => onDrop(e, story) : undefined}
      onDragEnd={onDragEnd}
      className={`group border rounded-lg p-3 cursor-pointer transition-all ${
        isDragging
          ? "opacity-50 border-dashed border-accent"
          : isDragOver
            ? "border-accent bg-accent/10 ring-2 ring-accent/30"
            : isInProgress 
              ? "border-accent bg-accent/5" 
              : isFailed
                ? "border-destructive bg-card"
                : isSelected 
                  ? "border-secondary bg-card" 
                  : "border-border bg-card hover:border-secondary/50"
      }`}
      onClick={handleClick}
    >
      {/* Header row */}
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="pill shrink-0">
            {story.id}
          </span>
          <h3 className="text-sm font-medium text-foreground truncate">{story.title}</h3>
          {isInProgress && (
            <span className="flex items-center gap-1 text-xs text-accent shrink-0">
              <svg className="w-3 h-3 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              Building
            </span>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {retryCount > 0 && (
            <span className="badge badge-warning">
              {retryCount}x
            </span>
          )}
          <span className={`badge ${statusColors[status]}`}>
            {statusLabels[status]}
          </span>
        </div>
      </div>

      {/* Description */}
      <p className="text-sm text-secondary line-clamp-2 mb-2">
        {story.description}
      </p>

      {/* Footer row */}
      <div className="flex items-center justify-between">
        <div className="text-xs text-muted">
          {criteriaCount} {criteriaCount === 1 ? "criterion" : "criteria"}
        </div>

        {/* Action buttons - visible on hover or when in-progress/failed */}
        <div className={`flex items-center gap-1 transition-opacity ${
          isInProgress || isFailed ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
        }`}>
          {/* Play/Pause button */}
          {(canPlay || canPause) && (
            <button
              onClick={handlePlayPause}
              className={`p-1 rounded-md transition-colors ${
                canPause 
                  ? 'hover:bg-warning/10 text-warning' 
                  : 'hover:bg-accent/10 text-accent'
              }`}
              aria-label={canPause ? "Pause build" : "Start build"}
              title={canPause ? "Pause build" : "Build this story"}
            >
              {canPause ? (
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                >
                  <rect x="6" y="4" width="4" height="16" rx="1" />
                  <rect x="14" y="4" width="4" height="16" rx="1" />
                </svg>
              ) : (
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                >
                  <path d="M8 5v14l11-7z" />
                </svg>
              )}
            </button>
          )}

          {/* Retry button for failed stories */}
          {isFailed && onRetry && (
            <button
              onClick={handleRetry}
              className="p-1 rounded-md hover:bg-warning/10 text-warning transition-colors"
              aria-label="Retry story"
              title="Retry this story"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                <path d="M3 3v5h5" />
                <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
                <path d="M16 16h5v5" />
              </svg>
            </button>
          )}

          {/* Edit button */}
          <button
            onClick={handleEdit}
            className="p-1 rounded-md hover:bg-card text-muted hover:text-foreground transition-colors"
            aria-label="Edit story"
            title="Edit story"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="14"
              height="14"
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

          {/* Delete button */}
          <button
            onClick={handleDelete}
            className="p-1 rounded-md hover:bg-destructive/10 text-muted hover:text-destructive transition-colors"
            aria-label="Delete story"
            title="Delete story"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="14"
              height="14"
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
    </div>
  );
}
