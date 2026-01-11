import type { Story } from "../stores/prdStore";

type StoryStatus = "pending" | "in-progress" | "complete" | "failed";

interface StoryCardProps {
  story: Story;
  onClick: (storyId: string) => void;
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

export function StoryCard({ story, onClick }: StoryCardProps) {
  const status = getStoryStatus(story);
  const criteriaCount = story.acceptanceCriteria.length;

  return (
    <div
      className="border border-border rounded-xl bg-card p-4 cursor-pointer hover:border-accent/50 transition-colors"
      onClick={() => onClick(story.id)}
    >
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="flex items-center gap-2">
          <span className="px-2 py-0.5 text-xs font-medium bg-accent/10 text-accent rounded">
            {story.id}
          </span>
          <h3 className="font-medium text-foreground">{story.title}</h3>
        </div>
        <span
          className={`px-2 py-0.5 text-xs font-medium rounded shrink-0 ${statusColors[status]}`}
        >
          {statusLabels[status]}
        </span>
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
