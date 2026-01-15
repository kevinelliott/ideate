import { lazy, Suspense, type ReactNode } from "react";
import type { Project } from "../stores/projectStore";
import { useBuildLoop } from "../hooks/useBuildLoop";
import { useProjectState } from "../hooks/useProjectState";
import { ProjectTopBar } from "./ProjectTopBar";

// Lazy load heavy panel components
const LogPanel = lazy(() => import("./LogPanel").then(m => ({ default: m.LogPanel })));
const AgentPanel = lazy(() => import("./AgentPanel").then(m => ({ default: m.AgentPanel })));
const TerminalPanel = lazy(() => import("./TerminalPanel").then(m => ({ default: m.TerminalPanel })));
const PreviewPanel = lazy(() => import("./PreviewPanel").then(m => ({ default: m.PreviewPanel })));

interface ProjectLayoutProps {
  project: Project;
  children: ReactNode;
}

function PanelFallback() {
  return <div className="h-8 bg-card/50 animate-pulse" />;
}

export function ProjectLayout({ project, children }: ProjectLayoutProps) {
  useBuildLoop(project.id, project.path);
  useProjectState(project.path);

  return (
    <div className="flex flex-1 h-screen min-w-0 overflow-hidden">
      <main className="flex-1 h-screen flex flex-col bg-background-secondary min-w-0 overflow-hidden border-t border-border">
        <ProjectTopBar
          key={project.id}
          projectId={project.id}
          projectPath={project.path}
          projectName={project.name}
          projectDescription={project.description}
        />
        
        {/* Center content area */}
        <div className="flex-1 overflow-hidden min-h-0 flex flex-col">
          {children}
        </div>

        {/* Bottom panels */}
        <div className="flex-shrink-0 overflow-hidden">
          <Suspense fallback={<PanelFallback />}>
            <LogPanel projectId={project.id} />
          </Suspense>
          <Suspense fallback={<PanelFallback />}>
            <AgentPanel projectId={project.id} projectPath={project.path} />
          </Suspense>
          <Suspense fallback={<PanelFallback />}>
            <TerminalPanel projectId={project.id} projectPath={project.path} />
          </Suspense>
        </div>
      </main>

      {/* Preview panel - always available, collapsed by default */}
      <Suspense fallback={null}>
        <PreviewPanel projectId={project.id} projectPath={project.path} />
      </Suspense>
    </div>
  );
}
