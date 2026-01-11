import { useProjectStore, type ProjectStatus } from '../stores/projectStore'

interface SidebarProps {
  onNewProject: () => void;
}

const statusColors: Record<ProjectStatus, string> = {
  idle: 'bg-gray-400',
  generating: 'bg-blue-500',
  ready: 'bg-green-500',
  error: 'bg-red-500',
}

export function Sidebar({ onNewProject }: SidebarProps) {
  const projects = useProjectStore((state) => state.projects)
  const activeProjectId = useProjectStore((state) => state.activeProjectId)
  const setActiveProject = useProjectStore((state) => state.setActiveProject)

  return (
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
              return (
                <li key={project.id}>
                  <button
                    onClick={() => setActiveProject(project.id)}
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
  );
}
