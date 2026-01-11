interface SidebarProps {
  onNewProject: () => void;
}

export function Sidebar({ onNewProject }: SidebarProps) {
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
        <p className="text-xs text-secondary text-center py-8">
          No projects yet
        </p>
      </div>
    </aside>
  );
}
