import React, { useState, useRef, useEffect, useCallback } from 'react'
import { useProjectStore, type ProjectStatus, type Project } from '../stores/projectStore'
import { useBuildStore } from '../stores/buildStore'
import { usePrdStore } from '../stores/prdStore'
import { useProcessStore, type ProcessType } from '../stores/processStore'
import { useTheme } from '../hooks/useTheme'
import { ProjectContextMenu } from './ProjectContextMenu'
import { DeleteProjectModal } from './DeleteProjectModal'
import { SettingsModal } from './SettingsModal'
import { AboutModal } from './AboutModal'
import { useIdeasStore } from '../stores/ideasStore'
import { CreateIdeaModal } from './CreateIdeaModal'

interface SidebarProps {
  onNewProject: () => void;
  onImportProject: () => void;
}

const MIN_WIDTH = 180
const MAX_WIDTH = 400
const DEFAULT_WIDTH = 240

const statusColors: Record<ProjectStatus, string> = {
  idle: 'bg-muted',
  generating: 'bg-accent animate-pulse',
  ready: 'bg-success',
  error: 'bg-destructive',
}

const processTypeIcons: Record<ProcessType, React.ReactNode> = {
  build: (
    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
    </svg>
  ),
  chat: (
    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
    </svg>
  ),
  prd: (
    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
  ),
  'dev-server': (
    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01" />
    </svg>
  ),
  detection: (
    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
    </svg>
  ),
}

interface ContextMenuState {
  isOpen: boolean
  project: Project | null
  x: number
  y: number
}

export function Sidebar({ onNewProject, onImportProject }: SidebarProps) {
  const projects = useProjectStore((state) => state.projects)
  const activeProjectId = useProjectStore((state) => state.activeProjectId)
  const setActiveProject = useProjectStore((state) => state.setActiveProject)
  const updateProject = useProjectStore((state) => state.updateProject)
  const removeProject = useProjectStore((state) => state.removeProject)
  
  const getProjectState = useBuildStore((state) => state.getProjectState)
  const startBuild = useBuildStore((state) => state.startBuild)
  const pauseBuild = useBuildStore((state) => state.pauseBuild)
  const resumeBuild = useBuildStore((state) => state.resumeBuild)
  const resetBuildState = useBuildStore((state) => state.resetBuildState)
  const projectStates = useBuildStore((state) => state.projectStates)

  const clearPrd = usePrdStore((state) => state.clearPrd)
  const loadedProjectId = usePrdStore((state) => state.loadedProjectId)

  void useProcessStore((state) => state.processes) // Subscribe to process changes
  const getProcessesByProject = useProcessStore((state) => state.getProcessesByProject)
  const selectProcess = useProcessStore((state) => state.selectProcess)

  const ideas = useIdeasStore((state) => state.ideas)
  const selectedIdeaId = useIdeasStore((state) => state.selectedIdeaId)
  const selectIdea = useIdeasStore((state) => state.selectIdea)
  const addIdea = useIdeasStore((state) => state.addIdea)

  const { theme, toggleTheme } = useTheme()

  const [width, setWidth] = useState(DEFAULT_WIDTH)
  const [isResizing, setIsResizing] = useState(false)
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [isAboutOpen, setIsAboutOpen] = useState(false)
  const [isCreateIdeaOpen, setIsCreateIdeaOpen] = useState(false)
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(new Set())
  const startXRef = useRef(0)
  const startWidthRef = useRef(0)

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

  const toggleProjectExpanded = (projectId: string) => {
    setExpandedProjects((prev) => {
      const next = new Set(prev)
      if (next.has(projectId)) {
        next.delete(projectId)
      } else {
        next.add(projectId)
      }
      return next
    })
  }

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    setIsResizing(true)
    startXRef.current = e.clientX
    startWidthRef.current = width
  }, [width])

  useEffect(() => {
    if (!isResizing) return

    const handleMouseMove = (e: MouseEvent) => {
      const deltaX = e.clientX - startXRef.current
      const newWidth = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, startWidthRef.current + deltaX))
      setWidth(newWidth)
    }

    const handleMouseUp = () => {
      setIsResizing(false)
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isResizing])

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
    const projectIdToDelete = deleteModal.projectId
    
    // If we're deleting the project whose PRD is currently loaded, clear it first
    if (loadedProjectId === projectIdToDelete) {
      clearPrd()
    }
    
    // Also clear the build state for this project
    resetBuildState(projectIdToDelete)
    
    // Remove the project from the expanded set
    setExpandedProjects((prev) => {
      const next = new Set(prev)
      next.delete(projectIdToDelete)
      return next
    })
    
    removeProject(projectIdToDelete)
    setDeleteModal({ isOpen: false, projectId: '', projectName: '' })
  }

  const handlePlayPause = (e: React.MouseEvent, projectId: string) => {
    e.stopPropagation()
    
    const projectBuildState = getProjectState(projectId)
    const buildStatus = projectBuildState.status
    
    if (projectId !== activeProjectId) {
      setActiveProject(projectId)
    }
    
    if (buildStatus === 'idle') {
      window.dispatchEvent(new CustomEvent('sidebar-start-build', { detail: { projectId } }))
      startBuild(projectId)
    } else if (buildStatus === 'running') {
      pauseBuild(projectId)
    } else if (buildStatus === 'paused') {
      resumeBuild(projectId)
    }
  }

  const handleProjectClick = (project: Project) => {
    if (project.id === activeProjectId) {
      toggleProjectExpanded(project.id)
    } else {
      selectIdea(null)
      setActiveProject(project.id)
      setExpandedProjects((prev) => {
        const next = new Set(prev)
        next.add(project.id)
        return next
      })
    }
  }

  const getPlayButtonIcon = (projectId: string) => {
    const projectBuildState = getProjectState(projectId)
    const buildStatus = projectBuildState.status
    
    if (buildStatus === 'running') {
      return (
        <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
          <rect x="6" y="4" width="4" height="16" rx="1" />
          <rect x="14" y="4" width="4" height="16" rx="1" />
        </svg>
      )
    } else if (buildStatus === 'paused') {
      return (
        <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
          <path d="M8 5v14l11-7z" />
        </svg>
      )
    } else {
      return (
        <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
          <path d="M8 5v14l11-7z" />
        </svg>
      )
    }
  }

  const getPlayButtonClass = (projectId: string) => {
    const projectBuildState = getProjectState(projectId)
    const buildStatus = projectBuildState.status
    
    if (buildStatus === 'running') {
      return 'text-warning hover:bg-warning/10'
    } else if (buildStatus === 'paused') {
      return 'text-accent hover:bg-accent/10'
    } else {
      return 'text-muted hover:text-accent hover:bg-accent/10'
    }
  }

  const getStatusDotClass = (project: Project) => {
    const projectBuildState = projectStates[project.id]
    const buildStatus = projectBuildState?.status
    
    if (buildStatus === 'running') {
      return 'bg-accent animate-pulse'
    } else if (buildStatus === 'paused') {
      return 'bg-warning'
    } else {
      return statusColors[project.status]
    }
  }

  const getThemeIcon = () => {
    if (theme === 'light') {
      return (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
        </svg>
      )
    } else if (theme === 'dark') {
      return (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
        </svg>
      )
    } else {
      return (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
        </svg>
      )
    }
  }

  const getThemeLabel = () => {
    if (theme === 'light') return 'Light'
    if (theme === 'dark') return 'Dark'
    return 'System'
  }

  return (
    <>
      <aside
        className="h-screen flex flex-col bg-background border-t border-r border-border relative flex-shrink-0"
        style={{ width }}
      >
        
        <div className="flex items-center justify-between px-3 py-2">
          <h2 className="text-xs font-medium text-muted uppercase tracking-wider">
            Projects
          </h2>
          <div className="flex items-center gap-1">
            <button
              onClick={onImportProject}
              className="no-drag w-6 h-6 flex items-center justify-center rounded-md hover:bg-card transition-colors"
              aria-label="Import Project"
              title="Import existing project"
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
                  strokeWidth={1.5} 
                  d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" 
                />
              </svg>
            </button>
            <button
              onClick={onNewProject}
              className="no-drag w-6 h-6 flex items-center justify-center rounded-md hover:bg-card transition-colors"
              aria-label="New Project"
              title="Create new project"
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
        </div>
        
        <div className="flex-1 overflow-y-auto px-2 scrollbar-auto-hide">
          {projects.length === 0 ? (
            <p className="text-xs text-muted text-center py-8 px-4">
              No projects yet. Create one to get started.
            </p>
          ) : (
            <ul className="space-y-0.5">
              {projects.map((project) => {
                const isActive = project.id === activeProjectId
                const isEditing = project.id === editingProjectId
                const isExpanded = expandedProjects.has(project.id)
                const projectBuildState = projectStates[project.id]
                const buildStatus = projectBuildState?.status || 'idle'
                const isRunningOrPaused = buildStatus === 'running' || buildStatus === 'paused'
                const runningProcesses = getProcessesByProject(project.id)
                const hasRunningProcesses = runningProcesses.length > 0

                if (isEditing) {
                  return (
                    <li key={project.id}>
                      <div className="flex items-center gap-2 px-2 py-1.5">
                        <span
                          className={`w-2 h-2 rounded-full flex-shrink-0 ${getStatusDotClass(project)}`}
                          aria-label={`Status: ${project.status}`}
                        />
                        <input
                          ref={editInputRef}
                          type="text"
                          value={editingName}
                          onChange={(e) => setEditingName(e.target.value)}
                          onBlur={handleSaveInlineRename}
                          onKeyDown={handleRenameKeyDown}
                          className="flex-1 text-sm bg-card border border-border rounded-md px-2 py-0.5 text-foreground focus:outline-none focus:border-secondary min-w-0"
                        />
                      </div>
                    </li>
                  )
                }

                return (
                  <li key={project.id}>
                    {/* Project row */}
                    <div className="group">
                      <div
                        onClick={() => handleProjectClick(project)}
                        onContextMenu={(e) => handleContextMenu(e, project)}
                        className={`w-full flex items-center gap-1.5 px-2 py-1.5 rounded-md text-left transition-colors cursor-pointer ${
                          isActive
                            ? 'bg-card text-foreground'
                            : 'hover:bg-card/50 text-secondary hover:text-foreground'
                        }`}
                      >
                        {/* Expand/collapse chevron */}
                        <svg
                          className={`w-3 h-3 text-muted flex-shrink-0 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                        <span
                          className={`w-2 h-2 rounded-full flex-shrink-0 ${getStatusDotClass(project)}`}
                          aria-label={`Status: ${project.status}`}
                        />
                        <span className="text-sm truncate flex-1 min-w-0">{project.name}</span>
                        {hasRunningProcesses && (
                          <span className="text-[10px] text-accent font-medium flex-shrink-0">
                            {runningProcesses.length}
                          </span>
                        )}
                        <button
                          onClick={(e) => handlePlayPause(e, project.id)}
                          className={`w-5 h-5 flex items-center justify-center rounded opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 ${getPlayButtonClass(project.id)} ${
                            isRunningOrPaused ? 'opacity-100' : ''
                          }`}
                          aria-label={buildStatus === 'running' ? 'Pause build' : 'Start build'}
                        >
                          {getPlayButtonIcon(project.id)}
                        </button>
                      </div>
                    </div>

                    {/* Expanded content */}
                    {isExpanded && (
                      <ul className="ml-3 mt-0.5 space-y-0.5 border-l border-border pl-2">
                        {/* Requirements item */}
                        <li>
                          <div
                            onClick={() => { selectIdea(null); setActiveProject(project.id); }}
                            className={`flex items-center gap-2 px-2 py-1 rounded-md text-xs transition-colors cursor-pointer ${
                              isActive
                                ? 'text-foreground hover:bg-card/50'
                                : 'text-secondary hover:text-foreground hover:bg-card/50'
                            }`}
                          >
                            <svg className="w-3.5 h-3.5 text-muted flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                            <span>Requirements</span>
                          </div>
                        </li>

                        {/* Running processes */}
                        {runningProcesses.map((process) => (
                          <li key={process.processId}>
                            <button
                              onClick={() => selectProcess(process.processId)}
                              className="w-full flex items-center gap-2 px-2 py-1 rounded-md text-xs text-secondary hover:text-foreground hover:bg-card/50 transition-colors cursor-pointer"
                            >
                              <span className="w-2 h-2 rounded-full flex-shrink-0 bg-accent animate-pulse" />
                              <span className="text-muted flex-shrink-0">
                                {processTypeIcons[process.type]}
                              </span>
                              <span className="truncate" title={process.label}>
                                {process.label}
                              </span>
                            </button>
                          </li>
                        ))}

                        {/* Show build status if paused but no processes */}
                        {isRunningOrPaused && runningProcesses.length === 0 && (
                          <li>
                            <div className="flex items-center gap-2 px-2 py-1 rounded-md text-xs text-secondary">
                              <span className={`w-2 h-2 rounded-full flex-shrink-0 ${buildStatus === 'running' ? 'bg-accent animate-pulse' : 'bg-warning'}`} />
                              <span className="truncate">
                                {buildStatus === 'paused' ? 'Build paused' : 'Waiting...'}
                              </span>
                            </div>
                          </li>
                        )}
                      </ul>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        {/* Ideas section */}
        <div className="flex-shrink-0 border-t border-border">
          <div className="flex items-center justify-between px-3 py-2">
            <h2 className="text-xs font-medium text-muted uppercase tracking-wider">
              Ideas
            </h2>
            <button
              onClick={() => setIsCreateIdeaOpen(true)}
              className="no-drag w-6 h-6 flex items-center justify-center rounded-md hover:bg-card transition-colors"
              aria-label="New Idea"
              title="Create new idea"
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
          
          <div className="max-h-40 overflow-y-auto px-2 pb-2 scrollbar-auto-hide">
            {ideas.length === 0 ? (
              <p className="text-xs text-muted text-center py-4 px-2">
                No ideas yet
              </p>
            ) : (
              <ul className="space-y-0.5">
                {ideas.map((idea) => {
                  const isSelected = idea.id === selectedIdeaId
                  return (
                    <li key={idea.id}>
                      <button
                        onClick={() => {
                          selectIdea(idea.id)
                          setActiveProject(null)
                        }}
                        className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-left transition-colors ${
                          isSelected
                            ? 'bg-card text-foreground'
                            : 'hover:bg-card/50 text-secondary hover:text-foreground'
                        }`}
                      >
                        <svg
                          className="w-3.5 h-3.5 text-accent flex-shrink-0"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={1.5}
                            d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
                          />
                        </svg>
                        <span className="text-sm truncate flex-1 min-w-0">{idea.title}</span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </div>

        {/* Bottom section with theme, feedback, about, and settings */}
        <div className="flex-shrink-0 border-t border-border px-3 py-2">
          <div className="flex items-center justify-center gap-1">
            <button
              onClick={toggleTheme}
              className="p-2 rounded-md text-secondary hover:text-foreground hover:bg-card transition-colors"
              title={`Theme: ${getThemeLabel()}`}
            >
              {getThemeIcon()}
            </button>

            <button
              onClick={() => window.open('mailto:kevin@welikeideas.com?subject=Ideate%20Feedback', '_blank')}
              className="p-2 rounded-md text-secondary hover:text-foreground hover:bg-card transition-colors"
              title="Send Feedback"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
            </button>

            <button
              onClick={() => setIsAboutOpen(true)}
              className="p-2 rounded-md text-secondary hover:text-foreground hover:bg-card transition-colors"
              title="About Ideate"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </button>

            <button
              onClick={() => setIsSettingsOpen(true)}
              className="p-2 rounded-md text-secondary hover:text-foreground hover:bg-card transition-colors"
              title="Settings"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </button>
          </div>
        </div>
        {/* Resize handle */}
        <div
          onMouseDown={handleMouseDown}
          className={`absolute top-0 right-0 w-1 h-full cursor-ew-resize hover:bg-accent/30 active:bg-accent/50 ${
            isResizing ? 'bg-accent/50' : ''
          }`}
        />
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

      <AboutModal
        isOpen={isAboutOpen}
        onClose={() => setIsAboutOpen(false)}
      />

      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
      />

      <CreateIdeaModal
        isOpen={isCreateIdeaOpen}
        onClose={() => setIsCreateIdeaOpen(false)}
        onSave={async (ideaData) => {
          const newIdea = await addIdea(ideaData)
          selectIdea(newIdea.id)
          setActiveProject(null)
        }}
      />
    </>
  );
}
