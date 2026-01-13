import { useState } from "react";
import { useModalKeyboard } from "../hooks/useModalKeyboard";

interface GenerateStoriesModalProps {
  isOpen: boolean;
  isGenerating: boolean;
  onClose: () => void;
  onGenerate: (request: string) => void;
  onDismiss?: () => void;
}

export function GenerateStoriesModal({
  isOpen,
  isGenerating,
  onClose,
  onGenerate,
  onDismiss,
}: GenerateStoriesModalProps) {
  const [request, setRequest] = useState("");

  useModalKeyboard(isOpen && !isGenerating, onClose);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (request.trim() && !isGenerating) {
      onGenerate(request.trim());
    }
  };

  const handleClose = () => {
    if (!isGenerating) {
      setRequest("");
      onClose();
    }
  };

  const handleDismiss = () => {
    setRequest("");
    onDismiss?.();
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-card rounded-xl shadow-2xl w-full max-w-lg overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-500/20 to-pink-500/20 border border-purple-500/30 flex items-center justify-center">
              <svg
                className="w-4 h-4 text-purple-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z"
                />
              </svg>
            </div>
            <div>
              <h2 className="text-lg font-semibold">Generate User Stories</h2>
              <p className="text-xs text-muted">AI-powered story generation</p>
            </div>
          </div>
          {!isGenerating && (
            <button
              onClick={handleClose}
              className="p-1.5 rounded-lg text-muted hover:text-foreground hover:bg-card transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>

        <form onSubmit={handleSubmit}>
          <div className="p-6 space-y-4">
            {isGenerating ? (
              <div className="flex flex-col items-center justify-center py-8">
                <div className="relative">
                  <svg
                    className="w-12 h-12 text-purple-400 animate-spin"
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
                <p className="mt-4 text-sm font-medium text-foreground">Generating User Stories</p>
                <p className="mt-1 text-xs text-muted">AI is analyzing your request and creating stories...</p>
              </div>
            ) : (
              <>
                <div>
                  <label className="block text-sm font-medium text-secondary mb-2">
                    What would you like to add?
                  </label>
                  <textarea
                    value={request}
                    onChange={(e) => setRequest(e.target.value)}
                    placeholder="Describe fixes, changes, or new features you'd like to add...

Examples:
• Add user authentication with login and signup
• Fix the navigation menu on mobile devices  
• Add a dark mode toggle to settings
• Implement search functionality for products"
                    className="w-full h-40 px-4 py-3 rounded-lg bg-background border border-border text-foreground placeholder-muted/50 focus:outline-none focus:border-accent resize-none"
                    autoFocus
                  />
                </div>
                <p className="text-xs text-muted">
                  The AI will analyze your existing stories and generate new ones that are properly prioritized and broken down into actionable tasks.
                </p>
              </>
            )}
          </div>

          <div className="flex justify-end gap-3 px-6 py-4 border-t border-border bg-background-secondary">
            {isGenerating ? (
              <button
                type="button"
                onClick={handleDismiss}
                className="px-4 py-2 rounded-lg text-secondary hover:text-foreground hover:bg-card transition-colors flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                </svg>
                Run in Background
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={handleClose}
                  className="px-4 py-2 rounded-lg text-secondary hover:text-foreground hover:bg-card transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!request.trim()}
                  className="px-4 py-2 rounded-lg bg-gradient-to-r from-purple-500 to-pink-500 text-white font-medium hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
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
                      d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z"
                    />
                  </svg>
                  Generate Stories
                </button>
              </>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
