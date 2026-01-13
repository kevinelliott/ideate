import { useState, useEffect } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { documentDir } from "@tauri-apps/api/path";
import { useModalKeyboard } from "../hooks/useModalKeyboard";

interface ImportProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImport: (name: string, directory: string, generatePrd: boolean) => void;
}

export function ImportProjectModal({ isOpen, onClose, onImport }: ImportProjectModalProps) {
  const [name, setName] = useState("");
  const [directory, setDirectory] = useState<string | null>(null);
  const [generatePrd, setGeneratePrd] = useState(true);

  useModalKeyboard(isOpen, onClose);

  useEffect(() => {
    if (isOpen) {
      setName("");
      setDirectory(null);
      setGeneratePrd(true);
    }
  }, [isOpen]);

  useEffect(() => {
    if (directory && !name) {
      const parts = directory.split("/");
      const folderName = parts[parts.length - 1];
      if (folderName) {
        const formattedName = folderName
          .replace(/[-_]/g, " ")
          .replace(/\b\w/g, (c) => c.toUpperCase());
        setName(formattedName);
      }
    }
  }, [directory, name]);

  if (!isOpen) return null;

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  const handleImport = () => {
    if (name.trim() && directory) {
      onImport(name.trim(), directory, generatePrd);
      setName("");
      setDirectory(null);
      setGeneratePrd(true);
    }
  };

  const handleDirectoryPick = async () => {
    try {
      const defaultPath = await documentDir();
      const selected = await open({
        directory: true,
        multiple: false,
        defaultPath,
        title: "Choose Existing Project Directory",
      });
      if (selected) {
        setDirectory(selected);
      }
    } catch (error) {
      console.error("Failed to open directory picker:", error);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50"
      onClick={handleOverlayClick}
    >
      <div className="bg-card border border-border rounded-lg shadow-2xl w-full max-w-md no-drag">
        <div className="px-5 py-4 border-b border-border">
          <h2 className="text-base font-semibold text-foreground">Import Existing Project</h2>
          <p className="text-xs text-muted mt-1">
            Import an existing codebase into Ideate
          </p>
        </div>

        <div className="p-5 space-y-4">
          <div>
            <label className="label">Project Directory</label>
            <button
              onClick={handleDirectoryPick}
              className="w-full px-3 py-2 rounded-md border border-border bg-card text-left hover:bg-border/30 transition-colors text-sm"
            >
              <span className={directory ? "text-foreground" : "text-muted"}>
                {directory || "Choose Existing Directory..."}
              </span>
            </button>
          </div>

          <div>
            <label className="label">Project Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My Existing App"
              className="input"
            />
            <p className="text-xs text-muted mt-1">
              Auto-filled from directory name
            </p>
          </div>

          <div className="pt-2">
            <label className="block text-sm text-foreground mb-3">
              PRD Generation
            </label>
            <div className="flex gap-2">
              <button
                onClick={() => setGeneratePrd(true)}
                className={`flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg border transition-colors ${
                  generatePrd
                    ? "border-accent bg-accent/10 text-accent"
                    : "border-border hover:border-secondary text-secondary hover:text-foreground"
                }`}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <span className="text-sm font-medium">Generate PRD</span>
              </button>
              <button
                onClick={() => setGeneratePrd(false)}
                className={`flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg border transition-colors ${
                  !generatePrd
                    ? "border-accent bg-accent/10 text-accent"
                    : "border-border hover:border-secondary text-secondary hover:text-foreground"
                }`}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                </svg>
                <span className="text-sm font-medium">Skip PRD</span>
              </button>
            </div>
            <p className="text-xs text-muted mt-2">
              {generatePrd
                ? "Analyze the codebase and generate user stories that describe the existing functionality."
                : "Import the project without generating a PRD. You can add stories manually later."}
            </p>
          </div>
        </div>

        <div className="px-5 py-4 border-t border-border flex justify-end gap-2">
          <button onClick={onClose} className="btn btn-ghost">
            Cancel
          </button>
          <button
            onClick={handleImport}
            disabled={!name.trim() || !directory}
            className="btn btn-primary"
          >
            Import Project
          </button>
        </div>
      </div>
    </div>
  );
}
