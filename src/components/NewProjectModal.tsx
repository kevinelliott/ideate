import { useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { documentDir } from "@tauri-apps/api/path";
import { useModalKeyboard } from "../hooks/useModalKeyboard";

interface NewProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (name: string, description: string, directory: string | null) => void;
}

export function NewProjectModal({ isOpen, onClose, onCreate }: NewProjectModalProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [directory, setDirectory] = useState<string | null>(null);

  useModalKeyboard(isOpen, onClose);

  if (!isOpen) return null;

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  const handleCreate = () => {
    if (name.trim()) {
      onCreate(name.trim(), description.trim(), directory);
      setName("");
      setDescription("");
      setDirectory(null);
    }
  };

  const handleDirectoryPick = async () => {
    try {
      const defaultPath = await documentDir();
      const selected = await open({
        directory: true,
        multiple: false,
        defaultPath,
        title: "Choose Project Directory",
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
          <h2 className="text-base font-semibold text-foreground">New Project</h2>
        </div>

        <div className="p-5 space-y-4">
          <div>
            <label className="label">Project Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My Awesome App"
              className="input"
              autoFocus
            />
          </div>

          <div>
            <label className="label">Idea Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe your app idea..."
              rows={4}
              className="input textarea"
            />
          </div>

          <div>
            <label className="label">Project Directory</label>
            <button
              onClick={handleDirectoryPick}
              className="w-full px-3 py-2 rounded-md border border-border bg-card text-left hover:bg-border/30 transition-colors text-sm"
            >
              <span className={directory ? "text-foreground" : "text-muted"}>
                {directory || "Choose Directory..."}
              </span>
            </button>
          </div>
        </div>

        <div className="px-5 py-4 border-t border-border flex justify-end gap-2">
          <button onClick={onClose} className="btn btn-ghost">
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={!name.trim() || !directory}
            className="btn btn-primary"
          >
            Create Project
          </button>
        </div>
      </div>
    </div>
  );
}
