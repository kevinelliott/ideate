import { useModalKeyboard } from "../hooks/useModalKeyboard";

interface RegeneratePrdModalProps {
  isOpen: boolean;
  isRegenerating: boolean;
  storyCount: number;
  onClose: () => void;
  onConfirm: () => void;
  onDismiss?: () => void;
}

export function RegeneratePrdModal({
  isOpen,
  isRegenerating,
  storyCount,
  onClose,
  onConfirm,
  onDismiss,
}: RegeneratePrdModalProps) {
  useModalKeyboard(isOpen && !isRegenerating, onClose);

  if (!isOpen) return null;

  const handleDismiss = () => {
    onDismiss?.();
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-card rounded-xl shadow-2xl w-full max-w-md overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-warning/15 border border-warning/20 flex items-center justify-center">
              <svg
                className="w-4 h-4 text-warning"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>
            </div>
            <div>
              <h2 className="text-lg font-semibold">Regenerate PRD</h2>
              <p className="text-xs text-muted">This action cannot be undone</p>
            </div>
          </div>
          {!isRegenerating && (
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-muted hover:text-foreground hover:bg-card transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>

        <div className="p-6">
          {isRegenerating ? (
            <div className="flex flex-col items-center justify-center py-6">
              <svg
                className="w-10 h-10 text-accent animate-spin"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                />
              </svg>
              <p className="mt-4 text-sm font-medium text-foreground">Analyzing Codebase</p>
              <p className="mt-1 text-xs text-muted">Generating new PRD from existing code...</p>
            </div>
          ) : (
            <>
              <p className="text-sm text-secondary">
                This will analyze your current codebase and generate a completely new PRD, replacing all existing user stories.
              </p>
              
              {storyCount > 0 && (
                <div className="mt-4 p-3 rounded-lg bg-warning/10 border border-warning/20">
                  <div className="flex items-start gap-2">
                    <svg
                      className="w-4 h-4 text-warning flex-shrink-0 mt-0.5"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={1.5}
                        d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                      />
                    </svg>
                    <p className="text-xs text-warning">
                      <strong>{storyCount} existing {storyCount === 1 ? 'story' : 'stories'}</strong> will be permanently replaced.
                    </p>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        <div className="flex justify-end gap-3 px-6 py-4 border-t border-border bg-background-secondary">
          {isRegenerating ? (
            <button
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
                onClick={onClose}
                className="px-4 py-2 rounded-lg text-secondary hover:text-foreground hover:bg-card transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={onConfirm}
                className="px-4 py-2 rounded-lg bg-warning text-white font-medium hover:opacity-90 transition-opacity flex items-center gap-2"
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
                    d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                  />
                </svg>
                Regenerate PRD
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
