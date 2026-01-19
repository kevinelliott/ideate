import { useState } from "react";
import { createPortal } from "react-dom";
import { useModalKeyboard } from "../hooks/useModalKeyboard";

interface DeleteProjectModalProps {
  isOpen: boolean
  projectName: string
  projectPath: string
  onConfirm: (deleteFromDisk: boolean) => void | Promise<void>
  onCancel: () => void
}

export function DeleteProjectModal({
  isOpen,
  projectName,
  projectPath,
  onConfirm,
  onCancel,
}: DeleteProjectModalProps) {
  const [deleteFromDisk, setDeleteFromDisk] = useState(false);
  
  useModalKeyboard(isOpen, onCancel);

  if (!isOpen) return null

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onCancel()
    }
  }

  const handleConfirm = async () => {
    await onConfirm(deleteFromDisk);
    setDeleteFromDisk(false);
  }

  const handleCancel = () => {
    setDeleteFromDisk(false);
    onCancel();
  }

  const modalContent = (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50"
      onClick={handleOverlayClick}
    >
      <div className="no-drag w-full max-w-md bg-card border border-border rounded-xl shadow-xl p-6">
        <h2 className="text-lg font-semibold text-foreground mb-2">Delete Project?</h2>
        <p className="text-sm text-secondary mb-4">
          Are you sure you want to remove &quot;{projectName}&quot; from Ideate?
        </p>
        
        <label className="flex items-start gap-3 p-3 rounded-lg bg-background-secondary border border-border mb-4 cursor-pointer hover:bg-background-secondary/80 transition-colors">
          <input
            type="checkbox"
            checked={deleteFromDisk}
            onChange={(e) => setDeleteFromDisk(e.target.checked)}
            className="mt-0.5 w-4 h-4 rounded border-border text-accent focus:ring-accent"
          />
          <div className="flex-1 min-w-0">
            <span className="text-sm font-medium text-foreground">Also delete files from disk</span>
            <p className="text-xs text-muted mt-1 break-all">{projectPath}</p>
            {deleteFromDisk && (
              <p className="text-xs text-red-400 mt-1">⚠️ This will permanently delete all project files</p>
            )}
          </div>
        </label>
        
        <div className="flex justify-end gap-2">
          <button
            onClick={handleCancel}
            className="px-4 py-2 text-sm text-secondary hover:text-foreground transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            className="px-4 py-2 text-sm bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors"
          >
            {deleteFromDisk ? "Delete Forever" : "Remove"}
          </button>
        </div>
      </div>
    </div>
  )

  return createPortal(modalContent, document.body)
}
