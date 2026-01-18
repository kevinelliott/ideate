import { useEffect, useRef } from 'react'
import { invoke } from '@tauri-apps/api/core'

interface ProjectContextMenuProps {
  projectId: string
  projectName: string
  projectPath: string
  x: number
  y: number
  onClose: () => void
  onRename: () => void
  onDelete: () => void
  onShowProcessHistory: () => void
}

export function ProjectContextMenu({
  projectId,
  projectName,
  projectPath,
  x,
  y,
  onClose,
  onRename,
  onDelete,
  onShowProcessHistory,
}: ProjectContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose()
      }
    }
    
    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onClose()
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleEscape)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [onClose])

  const handleRevealInFinder = async () => {
    try {
      await invoke('reveal_in_file_manager', { path: projectPath })
      onClose()
    } catch (error) {
      console.error('Failed to reveal in Finder:', error)
      onClose()
    }
  }

  const handleRename = () => {
    onRename()
    onClose()
  }

  const handleDelete = () => {
    onDelete()
    onClose()
  }

  const handleProcessHistory = () => {
    onShowProcessHistory()
    onClose()
  }

  const handleOpenInNewWindow = async () => {
    try {
      await invoke('open_project_window', { projectId, projectName })
      onClose()
    } catch (error) {
      console.error('Failed to open project in new window:', error)
      onClose()
    }
  }

  const handleOpenStoryManager = async () => {
    try {
      await invoke('open_story_manager_command', { projectId, projectName })
      onClose()
    } catch (error) {
      console.error('Failed to open story manager:', error)
      onClose()
    }
  }

  return (
    <div
      ref={menuRef}
      className="fixed z-50 min-w-[160px] py-1 bg-card border border-border rounded-lg shadow-lg"
      style={{ left: x, top: y }}
    >
      <button
        onClick={handleOpenInNewWindow}
        className="w-full px-3 py-1.5 text-left text-sm text-foreground hover:bg-accent hover:text-white transition-colors"
      >
        Open in New Window
      </button>
      <button
        onClick={handleOpenStoryManager}
        className="w-full px-3 py-1.5 text-left text-sm text-foreground hover:bg-accent hover:text-white transition-colors"
      >
        Story Manager
      </button>
      <div className="my-1 border-t border-border" />
      <button
        onClick={handleRevealInFinder}
        className="w-full px-3 py-1.5 text-left text-sm text-foreground hover:bg-accent hover:text-white transition-colors"
      >
        Reveal in Finder
      </button>
      <button
        onClick={handleProcessHistory}
        className="w-full px-3 py-1.5 text-left text-sm text-foreground hover:bg-accent hover:text-white transition-colors"
      >
        Process History
      </button>
      <button
        onClick={handleRename}
        className="w-full px-3 py-1.5 text-left text-sm text-foreground hover:bg-accent hover:text-white transition-colors"
      >
        Rename
      </button>
      <div className="my-1 border-t border-border" />
      <button
        onClick={handleDelete}
        className="w-full px-3 py-1.5 text-left text-sm text-red-500 hover:bg-red-500/10 transition-colors"
      >
        Delete
      </button>
    </div>
  )
}
