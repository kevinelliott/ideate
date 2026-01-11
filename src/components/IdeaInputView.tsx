import { useState } from "react";
import { usePrdStore } from "../stores/prdStore";

interface IdeaInputViewProps {
  projectName: string;
  projectDescription: string;
  projectPath: string;
  onGeneratePrd: (idea: string) => void;
}

export function IdeaInputView({
  projectDescription,
  onGeneratePrd,
}: IdeaInputViewProps) {
  const [idea, setIdea] = useState(projectDescription);
  const status = usePrdStore((state) => state.status);
  const isGenerating = status === "generating";

  const handleGenerate = () => {
    if (!idea.trim()) return;
    onGeneratePrd(idea.trim());
  };

  return (
    <div className="max-w-2xl mx-auto">
      <div className="text-center mb-8">
        <div className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-gradient-to-br from-accent/20 to-accent/5 border border-accent/20 flex items-center justify-center">
          <svg
            className="w-10 h-10 text-accent"
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
        <h2 className="text-2xl font-semibold text-foreground mb-2">
          Describe Your Idea
        </h2>
        <p className="text-secondary">
          Tell us about the app you want to build. Be as detailed as possible — the more context you provide, the better the PRD will be.
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
            className="input textarea min-h-[200px] resize-y"
            disabled={isGenerating}
          />
        </div>

        <div className="flex items-center gap-2 text-sm text-secondary">
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
          className="btn btn-primary btn-lg w-full"
        >
          {isGenerating ? (
            <>
              <svg
                className="animate-spin -ml-1 mr-3 h-5 w-5 text-white"
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
                className="w-5 h-5 mr-2"
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
