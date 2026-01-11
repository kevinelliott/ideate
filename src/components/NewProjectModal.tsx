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
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
      onClick={handleOverlayClick}
    >
      <div className="bg-card rounded-xl shadow-2xl w-full max-w-md p-6 no-drag">
        <h2 className="text-lg font-semibold mb-4">New Project</h2>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-secondary mb-1">
              Project Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My Awesome App"
              className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground placeholder:text-secondary/60 focus:outline-none focus:ring-2 focus:ring-accent"
              autoFocus
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-secondary mb-1">
              Idea Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe your app idea..."
              rows={4}
              className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground placeholder:text-secondary/60 focus:outline-none focus:ring-2 focus:ring-accent resize-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-secondary mb-1">
              Project Directory
            </label>
            <button
              onClick={handleDirectoryPick}
              className="w-full px-3 py-2 rounded-lg border border-border bg-background text-left hover:bg-border/30 transition-colors"
            >
              <span className={directory ? "text-foreground" : "text-secondary/60"}>
                {directory || "Choose Directory..."}
              </span>
            </button>
          </div>
        </div>

        <div className="flex justify-end gap-3 mt-6">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-secondary hover:bg-border/50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={!name.trim()}
            className="px-4 py-2 rounded-lg bg-accent text-white font-medium hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Create
          </button>
        </div>
      </div>
    </div>
  );
}
