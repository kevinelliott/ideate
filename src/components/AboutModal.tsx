import { useModalKeyboard } from "../hooks/useModalKeyboard";

interface AboutModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function AboutModal({ isOpen, onClose }: AboutModalProps) {
  useModalKeyboard(isOpen, onClose);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-card rounded-xl shadow-2xl w-full max-w-sm overflow-hidden">
        {/* Content */}
        <div className="px-6 py-8 flex flex-col items-center text-center">
          {/* Logo */}
          <div className="w-20 h-20 mb-4">
            <img
              src="/icons/icon-transparent.png"
              alt="Ideate Logo"
              className="w-full h-full object-contain"
            />
          </div>

          {/* App Name & Version */}
          <h1 className="text-2xl font-bold text-foreground mb-1">Ideate</h1>
          <div className="flex items-center gap-2 mb-4">
            <span className="text-sm text-muted">Version 0.1.0</span>
            <span className="text-xs px-1.5 py-0.5 rounded bg-accent/10 text-accent font-medium">MIT License</span>
          </div>

          {/* Tagline */}
          <div className="flex items-center gap-2 mb-4 text-sm font-medium">
            <span className="text-accent">IDEA</span>
            <svg className="w-4 h-4 text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
            </svg>
            <span className="text-accent">PLAN</span>
            <svg className="w-4 h-4 text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
            </svg>
            <span className="text-accent">GENERATE</span>
          </div>

          {/* Description */}
          <p className="text-sm text-secondary mb-6 leading-relaxed">
            A free, open source desktop app for AI-powered software development.
            Generate PRDs, manage user stories, and integrate with 8 AI coding agents
            to build software faster than ever.
          </p>

          {/* Links */}
          <div className="space-y-3 w-full">
            <a
              href="https://x.com/kevinelliott"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 text-sm text-secondary hover:text-foreground transition-colors"
            >
              <span>Created by</span>
              <span className="text-accent font-medium">@kevinelliott</span>
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
              </svg>
            </a>

            <a
              href="https://ideate.sh"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 text-sm text-secondary hover:text-foreground transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="10" strokeWidth="2" />
                <path strokeLinecap="round" strokeWidth="2" d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
              </svg>
              <span>Visit Website</span>
            </a>

            <a
              href="https://github.com/kevinelliott/ideate"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 text-sm text-secondary hover:text-foreground transition-colors"
            >
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.477 2 12c0 4.42 2.865 8.17 6.839 9.49.5.092.682-.217.682-.482 0-.237-.008-.866-.013-1.7-2.782.604-3.369-1.34-3.369-1.34-.454-1.156-1.11-1.464-1.11-1.464-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.831.092-.646.35-1.086.636-1.336-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.578 9.578 0 0112 6.836c.85.004 1.705.114 2.504.336 1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.203 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.578.688.48C19.138 20.167 22 16.418 22 12c0-5.523-4.477-10-10-10z" />
              </svg>
              <span>View on GitHub</span>
            </a>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-border bg-background-secondary">
          <button
            onClick={onClose}
            className="w-full px-4 py-2 rounded-lg bg-accent text-white font-medium hover:opacity-90 transition-opacity"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
