import { useState, useEffect } from "react";
import { usePrdStore } from "../stores/prdStore";
import { useAgentStore } from "../stores/agentStore";
import { defaultPlugins, type AgentPlugin } from "../types";

interface IdeaInputViewProps {
  projectName: string;
  projectDescription: string;
  projectPath: string;
  projectId: string;
  onGeneratePrd: (idea: string, agentId: string) => void;
}

export function IdeaInputView({
  projectDescription,
  projectPath,
  projectId,
  onGeneratePrd,
}: IdeaInputViewProps) {
  const [idea, setIdea] = useState(projectDescription);
  const status = usePrdStore((state) => state.status);
  const isGenerating = status === "generating";
  
  const defaultAgentId = useAgentStore((state) => state.defaultAgentId);
  const [selectedAgentId, setSelectedAgentId] = useState(defaultAgentId);

  // Reset idea and agent when project changes
  useEffect(() => {
    setIdea(projectDescription);
    setSelectedAgentId(defaultAgentId);
  }, [projectPath, projectDescription, projectId, defaultAgentId]);

  const handleGenerate = () => {
    if (!idea.trim()) return;
    onGeneratePrd(idea.trim(), selectedAgentId);
  };

  return (
    <div className="max-w-xl">
      <div className="mb-6">
        <div className="w-12 h-12 mb-4 rounded-lg bg-accent/15 border border-accent/20 flex items-center justify-center">
          <svg
            className="w-6 h-6 text-accent"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
            />
          </svg>
        </div>
        <h2 className="text-lg font-semibold text-foreground mb-1">
          Describe Your Idea
        </h2>
        <p className="text-sm text-secondary">
          Tell us about the app you want to build. The more context you provide, the better the PRD will be.
        </p>
      </div>

      <div className="space-y-4">
        <div>
          <label htmlFor="idea-input" className="label">
            Your Idea
          </label>
          <textarea
            id="idea-input"
            value={idea}
            onChange={(e) => setIdea(e.target.value)}
            placeholder="Describe your app idea here. What problem does it solve? Who is it for? What are the main features?"
            className="input textarea min-h-[160px] resize-y"
            disabled={isGenerating}
          />
        </div>

        <div>
          <label htmlFor="agent-select" className="label">
            Agent
          </label>
          <select
            id="agent-select"
            value={selectedAgentId}
            onChange={(e) => setSelectedAgentId(e.target.value)}
            disabled={isGenerating}
            className="input"
          >
            {defaultPlugins.map((plugin: AgentPlugin) => (
              <option key={plugin.id} value={plugin.id}>
                {plugin.name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-start gap-2 text-xs text-muted">
          <svg
            className="w-4 h-4 shrink-0 mt-0.5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <span>
            The AI will generate user stories with acceptance criteria based on your description.
          </span>
        </div>

        <button
          onClick={handleGenerate}
          disabled={!idea.trim() || isGenerating}
          className="btn btn-primary w-full"
        >
          {isGenerating ? (
            <>
              <svg
                className="animate-spin h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
              Generating PRD...
            </>
          ) : (
            <>
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M13 10V3L4 14h7v7l9-11h-7z"
                />
              </svg>
              Generate PRD
            </>
          )}
        </button>
      </div>
    </div>
  );
}
