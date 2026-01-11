import { useState, useEffect } from 'react'

interface RenameProjectModalProps {
  isOpen: boolean
  projectId: string
  currentName: string
  onSave: (projectId: string, newName: string) => void
  onClose: () => void
}

export function RenameProjectModal({
  isOpen,
  projectId,
  currentName,
  onSave,
  onClose,
}: RenameProjectModalProps) {
  const [name, setName] = useState(currentName)

  useEffect(() => {
    if (isOpen) {
      setName(currentName)
    }
  }, [isOpen, currentName])

  if (!isOpen) return null

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (name.trim()) {
      onSave(projectId, name.trim())
    }
  }

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose()
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={handleOverlayClick}
    >
      <div className="no-drag w-full max-w-sm bg-card border border-border rounded-xl shadow-xl p-6">
        <h2 className="text-lg font-semibold text-foreground mb-4">Rename Project</h2>
        
        <form onSubmit={handleSubmit}>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Project name"
            autoFocus
            className="w-full px-3 py-2 bg-background border border-border rounded-lg text-foreground placeholder-secondary focus:outline-none focus:ring-2 focus:ring-accent"
          />
          
          <div className="flex justify-end gap-2 mt-4">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-secondary hover:text-foreground transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!name.trim()}
              className="px-4 py-2 text-sm bg-accent text-white rounded-lg hover:bg-accent/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Save
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
