import type { Story } from "../stores/prdStore";

interface StoryDetailPanelProps {
  story: Story;
  onClose: () => void;
  onEdit: (story: Story) => void;
}

export function StoryDetailPanel({ story, onClose, onEdit }: StoryDetailPanelProps) {
  const getStatusBadge = () => {
    if (story.passes) {
      return (
        <span className="px-2 py-0.5 text-xs font-medium rounded bg-green-500/20 text-green-500">
          Complete
        </span>
      );
    }
    return (
      <span className="px-2 py-0.5 text-xs font-medium rounded bg-secondary/20 text-secondary">
        Pending
      </span>
    );
  };

  return (
    <aside className="w-80 h-screen border-l border-border bg-card/80 backdrop-blur-xl flex flex-col overflow-hidden">
      <div className="flex items-center justify-between p-4 border-b border-border drag-region">
        <h2 className="text-sm font-semibold text-foreground no-drag">Story Details</h2>
        <div className="flex items-center gap-2 no-drag">
          <button
            onClick={() => onEdit(story)}
            className="p-1.5 rounded-lg hover:bg-accent/10 text-secondary hover:text-accent transition-colors"
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
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-secondary/10 text-secondary hover:text-foreground transition-colors"
            aria-label="Close panel"
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
        </div>
      </div>

      <div className="flex-1 overflow-auto p-4 space-y-6">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="px-2 py-0.5 text-xs font-medium bg-accent/10 text-accent rounded">
              {story.id}
            </span>
            {getStatusBadge()}
          </div>
          <h3 className="text-base font-semibold text-foreground">{story.title}</h3>
        </div>

        <div>
          <h4 className="text-xs font-medium text-secondary uppercase tracking-wide mb-2">
            Description
          </h4>
          <p className="text-sm text-foreground leading-relaxed">{story.description}</p>
        </div>

        <div>
          <h4 className="text-xs font-medium text-secondary uppercase tracking-wide mb-3">
            Acceptance Criteria
          </h4>
          <ul className="space-y-2">
            {story.acceptanceCriteria.map((criterion, index) => (
              <li key={index} className="flex items-start gap-3">
                <div className={`mt-0.5 w-5 h-5 rounded border flex items-center justify-center shrink-0 ${
                  story.passes 
                    ? "border-green-500 bg-green-500/10" 
                    : "border-border bg-background"
                }`}>
                  {story.passes && (
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="12"
                      height="12"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="text-green-500"
                    >
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  )}
                </div>
                <span className="text-sm text-foreground leading-relaxed">{criterion}</span>
              </li>
            ))}
          </ul>
        </div>

        {story.notes && (
          <div>
            <h4 className="text-xs font-medium text-secondary uppercase tracking-wide mb-2">
              Notes
            </h4>
            <p className="text-sm text-foreground leading-relaxed">{story.notes}</p>
          </div>
        )}

        <div className="text-xs text-secondary">
          Priority: {story.priority}
        </div>
      </div>
    </aside>
  );
}
