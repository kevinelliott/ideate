import { useState, useEffect } from "react";
import { useModalKeyboard } from "../hooks/useModalKeyboard";
import { useIdeaGeneration } from "../hooks/useIdeaGeneration";

interface CreateIdeaModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (idea: { title: string; summary: string; description: string }) => void;
}

export function CreateIdeaModal({ isOpen, onClose, onSave }: CreateIdeaModalProps) {
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [description, setDescription] = useState("");

  const { generateDescription, isGenerating, generationType } = useIdeaGeneration();

  useModalKeyboard(isOpen && !isGenerating, onClose);

  useEffect(() => {
    if (isOpen) {
      setTitle("");
      setSummary("");
      setDescription("");
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (title.trim() && !isGenerating) {
      onSave({
        title: title.trim(),
        summary: summary.trim(),
        description: description.trim(),
      });
      onClose();
    }
  };

  const handleGenerate = async () => {
    const result = await generateDescription('generate', title, summary, description);
    if (result) {
      setDescription(result);
    }
  };

  const handleShorten = async () => {
    const result = await generateDescription('shorten', title, summary, description);
    if (result) {
      setDescription(result);
    }
  };

  const handleLengthen = async () => {
    const result = await generateDescription('lengthen', title, summary, description);
    if (result) {
      setDescription(result);
    }
  };

  const handleSimplify = async () => {
    const result = await generateDescription('simplify', title, summary, description);
    if (result) {
      setDescription(result);
    }
  };

  const isValid = title.trim().length > 0;
  const canGenerate = title.trim().length > 0 && !isGenerating;
  const canModify = description.trim().length > 0 && !isGenerating;

  const AIButton = ({
    onClick,
    disabled,
    isActive,
    icon,
    label,
    title: buttonTitle,
  }: {
    onClick: () => void;
    disabled: boolean;
    isActive: boolean;
    icon: React.ReactNode;
    label: string;
    title: string;
  }) => (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={buttonTitle}
      className={`flex items-center gap-1.5 px-2 py-1 rounded-md text-xs transition-all ${
        isActive
          ? "bg-accent/20 text-accent border border-accent/30"
          : disabled
          ? "text-muted/50 cursor-not-allowed"
          : "text-muted hover:text-foreground hover:bg-card border border-transparent hover:border-border"
      }`}
    >
      {isActive ? (
        <svg className="w-3.5 h-3.5 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
        </svg>
      ) : (
        icon
      )}
      <span>{label}</span>
    </button>
  );

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-card rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-accent/15 border border-accent/20 flex items-center justify-center">
              <svg
                className="w-4 h-4 text-accent"
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
            <div>
              <h2 className="text-lg font-semibold">New Idea</h2>
              <p className="text-xs text-muted">Capture your idea</p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isGenerating}
            className="p-1.5 rounded-lg text-muted hover:text-foreground hover:bg-card transition-colors disabled:opacity-50"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
          <div className="p-6 space-y-4 overflow-y-auto flex-1">
            <div>
              <label htmlFor="idea-title" className="block text-sm font-medium text-secondary mb-1.5">
                Title
              </label>
              <input
                id="idea-title"
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="A short, memorable title"
                className="w-full px-3 py-2 rounded-lg bg-background border border-border text-foreground placeholder-muted/50 focus:outline-none focus:border-accent"
                autoFocus
                maxLength={100}
                disabled={isGenerating}
              />
              <p className="text-xs text-muted mt-1">{title.length}/100 characters</p>
            </div>

            <div>
              <label htmlFor="idea-summary" className="block text-sm font-medium text-secondary mb-1.5">
                Summary
              </label>
              <input
                id="idea-summary"
                type="text"
                value={summary}
                onChange={(e) => setSummary(e.target.value)}
                placeholder="A brief one-line summary"
                className="w-full px-3 py-2 rounded-lg bg-background border border-border text-foreground placeholder-muted/50 focus:outline-none focus:border-accent"
                maxLength={200}
                disabled={isGenerating}
              />
              <p className="text-xs text-muted mt-1">{summary.length}/200 characters</p>
            </div>

            <div className="flex-1">
              <div className="flex items-center justify-between mb-1.5">
                <label htmlFor="idea-description" className="block text-sm font-medium text-secondary">
                  Description
                </label>
                <div className="flex items-center gap-1">
                  <AIButton
                    onClick={handleGenerate}
                    disabled={!canGenerate}
                    isActive={isGenerating && generationType === 'generate'}
                    title="Generate description from title and summary"
                    label="Generate"
                    icon={
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
                      </svg>
                    }
                  />
                  <AIButton
                    onClick={handleShorten}
                    disabled={!canModify}
                    isActive={isGenerating && generationType === 'shorten'}
                    title="Make description more concise"
                    label="Shorten"
                    icon={
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 12H4" />
                      </svg>
                    }
                  />
                  <AIButton
                    onClick={handleLengthen}
                    disabled={!canModify}
                    isActive={isGenerating && generationType === 'lengthen'}
                    title="Expand description with more detail"
                    label="Lengthen"
                    icon={
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 8h16M4 16h16" />
                      </svg>
                    }
                  />
                  <AIButton
                    onClick={handleSimplify}
                    disabled={!canModify}
                    isActive={isGenerating && generationType === 'simplify'}
                    title="Make description easier to read"
                    label="Simplify"
                    icon={
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
                      </svg>
                    }
                  />
                </div>
              </div>
              <textarea
                id="idea-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Detailed description of your idea...

You can use Markdown:
- **bold** and *italic* text
- Lists and headers
- Code blocks with ```
- And more..."
                className="w-full h-64 px-3 py-2 rounded-lg bg-background border border-border text-foreground placeholder-muted/50 focus:outline-none focus:border-accent resize-none font-mono text-sm"
                disabled={isGenerating}
              />
              <p className="text-xs text-muted mt-1">Supports Markdown formatting</p>
            </div>
          </div>

          <div className="flex justify-end gap-3 px-6 py-4 border-t border-border bg-background-secondary">
            <button
              type="button"
              onClick={onClose}
              disabled={isGenerating}
              className="px-4 py-2 rounded-lg text-secondary hover:text-foreground hover:bg-card transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!isValid || isGenerating}
              className="px-4 py-2 rounded-lg bg-accent text-white font-medium hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 4v16m8-8H4"
                />
              </svg>
              Create Idea
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
