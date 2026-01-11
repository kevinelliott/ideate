import { useState, useRef, useEffect } from 'react'
import { useProjectStore, type ProjectStatus, type Project } from '../stores/projectStore'
import { ProjectContextMenu } from './ProjectContextMenu'
import { DeleteProjectModal } from './DeleteProjectModal'

interface SidebarProps {
  onNewProject: () => void;
}

const statusColors: Record<ProjectStatus, string> = {
  idle: 'bg-gray-400',
  generating: 'bg-blue-500',
  ready: 'bg-green-500',
  error: 'bg-red-500',
}

interface ContextMenuState {
  isOpen: boolean
  project: Project | null
  x: number
  y: number
}

export function Sidebar({ onNewProject }: SidebarProps) {
  const projects = useProjectStore((state) => state.projects)
  const activeProjectId = useProjectStore((state) => state.activeProjectId)
  const setActiveProject = useProjectStore((state) => state.setActiveProject)
  const updateProject = useProjectStore((state) => state.updateProject)
  const removeProject = useProjectStore((state) => state.removeProject)

  const [contextMenu, setContextMenu] = useState<ContextMenuState>({
    isOpen: false,
    project: null,
    x: 0,
    y: 0,
  })

  const [editingProjectId, setEditingProjectId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')
  const editInputRef = useRef<HTMLInputElement>(null)

  const [deleteModal, setDeleteModal] = useState<{
    isOpen: boolean
    projectId: string
    projectName: string
  }>({
    isOpen: false,
    projectId: '',
    projectName: '',
  })

  useEffect(() => {
    if (editingProjectId && editInputRef.current) {
      editInputRef.current.focus()
      editInputRef.current.select()
    }
  }, [editingProjectId])

  const handleContextMenu = (e: React.MouseEvent, project: Project) => {
    e.preventDefault()
    setContextMenu({
      isOpen: true,
      project,
      x: e.clientX,
      y: e.clientY,
    })
  }

  const closeContextMenu = () => {
    setContextMenu({ isOpen: false, project: null, x: 0, y: 0 })
  }

  const handleRename = () => {
    if (contextMenu.project) {
      setEditingProjectId(contextMenu.project.id)
      setEditingName(contextMenu.project.name)
    }
  }

  const handleDelete = () => {
    if (contextMenu.project) {
      setDeleteModal({
        isOpen: true,
        projectId: contextMenu.project.id,
        projectName: contextMenu.project.name,
      })
    }
  }

  const handleSaveInlineRename = () => {
    if (editingProjectId && editingName.trim()) {
      updateProject(editingProjectId, { name: editingName.trim() })
    }
    setEditingProjectId(null)
    setEditingName('')
  }

  const handleCancelInlineRename = () => {
    setEditingProjectId(null)
    setEditingName('')
  }

  const handleRenameKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleSaveInlineRename()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      handleCancelInlineRename()
    }
  }

  const handleConfirmDelete = () => {
    removeProject(deleteModal.projectId)
    setDeleteModal({ isOpen: false, projectId: '', projectName: '' })
  }

  return (
    <>
      <aside className="w-60 h-screen flex flex-col bg-card/80 backdrop-blur-xl border-r border-border">
        <div className="h-12 flex items-center px-4 drag-region">
          {/* Space for traffic lights on macOS */}
        </div>
        
        <div className="flex items-center justify-between px-4 py-2">
          <h2 className="text-xs font-semibold text-secondary uppercase tracking-wide">
            Projects
          </h2>
          <button
            onClick={onNewProject}
            className="no-drag w-6 h-6 flex items-center justify-center rounded hover:bg-border/50 transition-colors"
            aria-label="New Project"
          >
            <svg 
              className="w-4 h-4 text-secondary" 
              fill="none" 
              stroke="currentColor" 
              viewBox="0 0 24 24"
            >
              <path 
                strokeLinecap="round" 
                strokeLinejoin="round" 
                strokeWidth={2} 
                d="M12 4v16m8-8H4" 
              />
            </svg>
          </button>
        </div>
        
        <div className="flex-1 overflow-y-auto px-2">
          {projects.length === 0 ? (
            <p className="text-xs text-secondary text-center py-8">
              No projects yet
            </p>
          ) : (
            <ul className="space-y-1">
              {projects.map((project) => {
                const isActive = project.id === activeProjectId
                const isEditing = project.id === editingProjectId

                if (isEditing) {
                  return (
                    <li key={project.id}>
                      <div className="flex items-center gap-2 px-2 py-1.5">
                        <span
                          className={`w-2 h-2 rounded-full flex-shrink-0 ${statusColors[project.status]}`}
                          aria-label={`Status: ${project.status}`}
                        />
                        <input
                          ref={editInputRef}
                          type="text"
                          value={editingName}
                          onChange={(e) => setEditingName(e.target.value)}
                          onBlur={handleSaveInlineRename}
                          onKeyDown={handleRenameKeyDown}
                          className="flex-1 text-sm bg-background border border-accent rounded px-1 py-0.5 text-foreground focus:outline-none focus:ring-1 focus:ring-accent"
                        />
                      </div>
                    </li>
                  )
                }

                return (
                  <li key={project.id}>
                    <button
                      onClick={() => setActiveProject(project.id)}
                      onContextMenu={(e) => handleContextMenu(e, project)}
                      className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-left transition-colors ${
                        isActive
                          ? 'bg-accent text-white'
                          : 'hover:bg-border/50 text-foreground'
                      }`}
                    >
                      <span
                        className={`w-2 h-2 rounded-full flex-shrink-0 ${statusColors[project.status]}`}
                        aria-label={`Status: ${project.status}`}
                      />
                      <span className="text-sm truncate">{project.name}</span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </aside>

      {contextMenu.isOpen && contextMenu.project && (
        <ProjectContextMenu
          projectId={contextMenu.project.id}
          projectName={contextMenu.project.name}
          projectPath={contextMenu.project.path}
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={closeContextMenu}
          onRename={handleRename}
          onDelete={handleDelete}
        />
      )}

      <DeleteProjectModal
        isOpen={deleteModal.isOpen}
        projectName={deleteModal.projectName}
        onConfirm={handleConfirmDelete}
        onCancel={() => setDeleteModal({ isOpen: false, projectId: '', projectName: '' })}
      />
    </>
  );
}
