interface DeleteProjectModalProps {
  isOpen: boolean
  projectName: string
  onConfirm: () => void
  onCancel: () => void
}

export function DeleteProjectModal({
  isOpen,
  projectName,
  onConfirm,
  onCancel,
}: DeleteProjectModalProps) {
  if (!isOpen) return null

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onCancel()
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={handleOverlayClick}
    >
      <div className="no-drag w-full max-w-sm bg-card border border-border rounded-xl shadow-xl p-6">
        <h2 className="text-lg font-semibold text-foreground mb-2">Delete Project?</h2>
        <p className="text-sm text-secondary mb-4">
          Are you sure you want to delete "{projectName}"? This action cannot be undone.
        </p>
        
        <div className="flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm text-secondary hover:text-foreground transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="px-4 py-2 text-sm bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  )
}
