import { useModalKeyboard } from "../hooks/useModalKeyboard";

interface DisclaimerModalProps {
  isOpen: boolean;
  onAccept: () => void;
}

export function DisclaimerModal({ isOpen, onAccept }: DisclaimerModalProps) {
  useModalKeyboard(isOpen, () => {});

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-card border border-border rounded-xl shadow-2xl max-w-lg w-full overflow-hidden">
        <div className="p-6 space-y-6">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-warning/10 rounded-full">
              <svg className="w-8 h-8 text-warning" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <div>
              <h2 className="text-xl font-semibold text-foreground">Alpha Software</h2>
              <p className="text-sm text-muted">Please read before continuing</p>
            </div>
          </div>

          <div className="space-y-4 text-sm text-secondary leading-relaxed">
            <p>
              <strong className="text-foreground">Ideate is currently in alpha.</strong> This means 
              the software is under active development and may contain bugs, incomplete features, 
              or unexpected behavior.
            </p>
            
            <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4">
              <p className="text-destructive font-medium mb-2">
                ⚠️ Important Recommendation
              </p>
              <p className="text-destructive/90">
                We strongly recommend <strong>not using Ideate on important existing applications 
                or production codebases</strong>. AI agents can make extensive changes to your code 
                that may be difficult to reverse.
              </p>
            </div>

            <p>
              Ideate is best suited for:
            </p>
            <ul className="list-disc list-inside space-y-1 text-secondary ml-2">
              <li>Experiments and exploration</li>
              <li>Learning and prototyping</li>
              <li>Throwaway projects</li>
              <li>New projects you're starting fresh</li>
            </ul>

            <p className="text-muted text-xs">
              Always use version control and keep backups of any code you care about.
            </p>
          </div>

          <button
            onClick={onAccept}
            className="w-full py-3 px-4 bg-destructive hover:bg-destructive/90 text-white font-medium rounded-lg transition-colors text-base"
          >
            I understand the risks
          </button>
        </div>
      </div>
    </div>
  );
}
