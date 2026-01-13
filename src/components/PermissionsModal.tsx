import { invoke } from "@tauri-apps/api/core";
import { useModalKeyboard } from "../hooks/useModalKeyboard";

interface PermissionsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function PermissionsModal({ isOpen, onClose }: PermissionsModalProps) {
  useModalKeyboard(isOpen, onClose);

  if (!isOpen) return null;

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  const handleOpenSettings = async () => {
    try {
      await invoke("open_full_disk_access_settings");
    } catch (error) {
      console.error("Failed to open settings:", error);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50"
      onClick={handleOverlayClick}
    >
      <div className="bg-card border border-border rounded-lg shadow-2xl w-full max-w-md no-drag">
        <div className="px-5 py-4 border-b border-border flex items-center gap-3">
          <div className="w-8 h-8 rounded-md bg-warning/15 flex items-center justify-center">
            <svg
              className="w-4 h-4 text-warning"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
          </div>
          <h2 className="text-base font-semibold text-foreground">Full Disk Access Required</h2>
        </div>

        <div className="p-5">
          <p className="text-sm text-secondary mb-4">
            Ideate needs Full Disk Access to create projects in protected folders like Desktop, Documents, and Downloads.
          </p>

          <div className="bg-background rounded-md border border-border p-4">
            <p className="text-xs text-muted uppercase tracking-wider mb-2 font-medium">To enable:</p>
            <ol className="text-sm text-secondary list-decimal list-inside space-y-1">
              <li>Click "Open Settings" below</li>
              <li>Find <span className="text-foreground font-medium">Ideate</span> in the list</li>
              <li>Toggle it on</li>
              <li>Restart Ideate</li>
            </ol>
          </div>
        </div>

        <div className="px-5 py-4 border-t border-border flex justify-end gap-2">
          <button onClick={onClose} className="btn btn-ghost">
            Cancel
          </button>
          <button onClick={handleOpenSettings} className="btn btn-primary">
            Open Settings
          </button>
        </div>
      </div>
    </div>
  );
}
