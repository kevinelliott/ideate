import { useMemo } from "react";
import { useBuildStore } from "../stores/buildStore";

interface PrdGeneratingViewProps {
  projectId: string;
  projectName: string;
}

interface DetectedStory {
  id: string;
  title: string;
}

export function PrdGeneratingView({ projectId, projectName }: PrdGeneratingViewProps) {
  const getProjectState = useBuildStore((state) => state.getProjectState);
  const projectState = getProjectState(projectId);
  const logs = projectState.logs;

  // Parse logs to extract story titles as they're generated
  const detectedStories = useMemo(() => {
    const stories: DetectedStory[] = [];
    const seenIds = new Set<string>();

    for (const log of logs) {
      const content = log.content;
      
      // Look for patterns like "US-001" or story IDs followed by titles
      // Common patterns in PRD generation output:
      // - "US-001: Title here"
      // - "**US-001**: Title"
      // - "Creating story US-001"
      // - JSON-like: "id": "US-001", "title": "..."
      
      // Pattern 1: US-XXX: Title or US-XXX - Title
      const storyPattern = /US-(\d{3})[:\s-]+([^"\n]+?)(?:\n|$|")/gi;
      let match;
      while ((match = storyPattern.exec(content)) !== null) {
        const id = `US-${match[1]}`;
        const title = match[2].trim().replace(/\*+/g, '').trim();
        if (!seenIds.has(id) && title.length > 3 && title.length < 200) {
          seenIds.add(id);
          stories.push({ id, title });
        }
      }

      // Pattern 2: JSON-like "title": "..."
      const jsonTitlePattern = /"title"\s*:\s*"([^"]+)"/gi;
      while ((match = jsonTitlePattern.exec(content)) !== null) {
        const title = match[1].trim();
        // Generate a temporary ID based on order
        const tempId = `story-${stories.length + 1}`;
        if (!Array.from(seenIds).some(id => id.startsWith('story-')) || !stories.some(s => s.title === title)) {
          if (title.length > 3 && title.length < 200 && !seenIds.has(title)) {
            seenIds.add(title);
            stories.push({ id: tempId, title });
          }
        }
      }
    }

    return stories;
  }, [logs]);

  return (
    <div className="w-full max-w-xl">
      {/* Header */}
      <div className="text-center mb-8">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-purple-500/20 to-pink-500/20 border border-purple-500/30 mb-4">
          <svg
            className="w-8 h-8 text-purple-400 animate-spin"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z"
            />
          </svg>
        </div>
        <h2 className="text-xl font-semibold text-foreground mb-2">
          Generating Requirements
        </h2>
        <p className="text-secondary text-sm">
          AI is analyzing your idea and creating user stories for{" "}
          <span className="text-foreground font-medium">{projectName}</span>
        </p>
      </div>

      {/* Progress info */}
      <div className="bg-card rounded-xl border border-border p-6 mb-6">
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-2 h-2 rounded-full bg-accent animate-pulse" />
            <span className="text-sm text-secondary">
              Creating user stories with acceptance criteria...
            </span>
          </div>
          <p className="text-xs text-muted leading-relaxed">
            The AI agent is reading your idea and breaking it down into actionable user stories.
            Each story will include a description, acceptance criteria, and priority level.
            This typically takes 1-2 minutes depending on complexity.
          </p>
        </div>
      </div>

      {/* Detected stories */}
      {detectedStories.length > 0 && (
        <div className="bg-card rounded-xl border border-border overflow-hidden">
          <div className="px-4 py-3 border-b border-border bg-background-secondary">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-foreground">
                Stories Detected
              </span>
              <span className="text-xs text-muted">
                {detectedStories.length} so far
              </span>
            </div>
          </div>
          <div className="max-h-64 overflow-y-auto scrollbar-auto-hide">
            <ul className="divide-y divide-border">
              {detectedStories.map((story, index) => (
                <li
                  key={story.id}
                  className="px-4 py-2.5 flex items-start gap-3 animate-fade-in"
                  style={{ animationDelay: `${index * 50}ms` }}
                >
                  <span className="text-xs font-mono text-accent flex-shrink-0 mt-0.5">
                    {story.id.startsWith('US-') ? story.id : `#${index + 1}`}
                  </span>
                  <span className="text-sm text-secondary line-clamp-2">
                    {story.title}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* Empty state while waiting for first story */}
      {detectedStories.length === 0 && (
        <div className="bg-card rounded-xl border border-border p-6">
          <div className="flex items-center justify-center gap-3 text-muted">
            <svg
              className="w-5 h-5 animate-pulse"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <span className="text-sm">Waiting for stories...</span>
          </div>
        </div>
      )}
    </div>
  );
}
