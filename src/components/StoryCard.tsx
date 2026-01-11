import { useState } from "react";
import type { Story } from "../stores/prdStore";

type StoryStatus = "pending" | "in-progress" | "complete" | "failed";

interface StoryCardProps {
  story: Story;
  onClick: (storyId: string) => void;
  onEdit: (story: Story) => void;
}

function getStoryStatus(story: Story): StoryStatus {
  if (story.passes) {
    return "complete";
  }
  return "pending";
}

const statusColors: Record<StoryStatus, string> = {
  pending: "bg-secondary/20 text-secondary",
  "in-progress": "bg-blue-500/20 text-blue-500",
  complete: "bg-green-500/20 text-green-500",
  failed: "bg-red-500/20 text-red-500",
};

const statusLabels: Record<StoryStatus, string> = {
  pending: "Pending",
  "in-progress": "In Progress",
  complete: "Complete",
  failed: "Failed",
};

export function StoryCard({ story, onClick, onEdit }: StoryCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const status = getStoryStatus(story);
  const criteriaCount = story.acceptanceCriteria.length;

  const handleClick = () => {
    setIsExpanded(!isExpanded);
    onClick(story.id);
  };

  const handleClose = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsExpanded(false);
  };

  const handleEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    onEdit(story);
  };

  return (
    <div
      className={`border rounded-xl bg-card p-4 cursor-pointer transition-colors ${
        isExpanded ? "border-accent" : "border-border hover:border-accent/50"
      }`}
      onClick={handleClick}
    >
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="flex items-center gap-2">
          <span className="px-2 py-0.5 text-xs font-medium bg-accent/10 text-accent rounded">
            {story.id}
          </span>
          <h3 className="font-medium text-foreground">{story.title}</h3>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span
            className={`px-2 py-0.5 text-xs font-medium rounded ${statusColors[status]}`}
          >
            {statusLabels[status]}
          </span>
          {isExpanded && (
            <>
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
                onClick={handleClose}
                className="p-1 rounded hover:bg-secondary/10 text-secondary hover:text-foreground transition-colors"
                aria-label="Close"
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
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </>
          )}
        </div>
      </div>

      {isExpanded ? (
        <div className="space-y-4">
          <p className="text-sm text-secondary">{story.description}</p>

          <div>
            <h4 className="text-xs font-medium text-foreground uppercase tracking-wide mb-2">
              Acceptance Criteria
            </h4>
            <ul className="space-y-2">
              {story.acceptanceCriteria.map((criterion, index) => (
                <li key={index} className="flex items-start gap-2 text-sm">
                  <div className="mt-0.5 w-4 h-4 rounded border border-border flex items-center justify-center shrink-0">
                    {story.passes && (
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="12"
                        height="12"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="text-green-500"
                      >
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    )}
                  </div>
                  <span className="text-secondary">{criterion}</span>
                </li>
              ))}
            </ul>
          </div>

          {story.notes && (
            <div>
              <h4 className="text-xs font-medium text-foreground uppercase tracking-wide mb-2">
                Notes
              </h4>
              <p className="text-sm text-secondary">{story.notes}</p>
            </div>
          )}
        </div>
      ) : (
        <>
          <p className="text-sm text-secondary line-clamp-2 mb-3">
            {story.description}
          </p>
          <div className="text-xs text-secondary">
            {criteriaCount} {criteriaCount === 1 ? "criterion" : "criteria"}
          </div>
        </>
      )}
    </div>
  );
}
