import { useEffect, useRef, lazy, Suspense } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useProjectStore } from "../stores/projectStore";
import { usePrdStore, type Story, type PrdMetadata } from "../stores/prdStore";
import { useIdeasStore } from "../stores/ideasStore";
import { useProcessStore } from "../stores/processStore";

// Lazy load heavy view components
const ProjectView = lazy(() => import("./ProjectView").then(m => ({ default: m.ProjectView })));
const IdeaDetailView = lazy(() => import("./IdeaDetailView").then(m => ({ default: m.IdeaDetailView })));
const AgentRunView = lazy(() => import("./AgentRunView").then(m => ({ default: m.AgentRunView })));

interface Prd {
  project?: string
  branchName?: string
  description?: string
  userStories: Array<{
    id: string
    title: string
    description: string
    acceptanceCriteria: string[]
    priority: number
    passes: boolean
    status?: string
    notes: string
  }>
}

// Loading fallback for views
function ViewFallback() {
  return (
    <main className="flex-1 h-screen flex flex-col bg-background-secondary border-t border-border">
      <div className="h-12 drag-region border-b border-border" />
      <div className="flex-1 flex items-center justify-center">
        <div className="text-muted">Loading...</div>
      </div>
    </main>
  );
}

export function MainContent() {
  const projects = useProjectStore((state) => state.projects);
  const activeProjectId = useProjectStore((state) => state.activeProjectId);
  const activeProject = projects.find((p) => p.id === activeProjectId);

  const setPrd = usePrdStore((state) => state.setPrd);
  const clearPrd = usePrdStore((state) => state.clearPrd);
  const setStatus = usePrdStore((state) => state.setStatus);
  const selectStory = usePrdStore((state) => state.selectStory);
  const loadedProjectId = usePrdStore((state) => state.loadedProjectId);

  const selectedIdeaId = useIdeasStore((state) => state.selectedIdeaId);
  const ideas = useIdeasStore((state) => state.ideas);
  const selectedIdea = ideas.find((idea) => idea.id === selectedIdeaId);

  const selectedProcessId = useProcessStore((state) => state.selectedProcessId);
  const getProcess = useProcessStore((state) => state.getProcess);
  const selectedProcess = selectedProcessId ? getProcess(selectedProcessId) : null;

  const loadingProjectIdRef = useRef<string | null>(null);

  // Load PRD when switching projects - use activeProjectId as key dependency
  useEffect(() => {
    async function loadPrd() {
      // If no active project, clear the PRD
      if (!activeProjectId || !activeProject?.path) {
        clearPrd();
        loadingProjectIdRef.current = null;
        return;
      }

      // If we're already loading or have loaded this project's PRD, skip
      if (loadedProjectId === activeProjectId) {
        return;
      }

      // Track which project we're loading
      loadingProjectIdRef.current = activeProjectId;

      // Clear existing stories and selection immediately when project changes
      clearPrd();
      setStatus("idle");

      try {
        const prd = await invoke<Prd | null>("load_prd", {
          projectPath: activeProject.path,
        });

        // Check if the active project changed while we were loading
        // If so, don't set the PRD - it will be loaded again for the new project
        if (loadingProjectIdRef.current !== activeProjectId) {
          return;
        }

        if (prd && prd.userStories && prd.userStories.length > 0) {
          const stories: Story[] = prd.userStories.map(story => ({
            id: story.id,
            title: story.title,
            description: story.description,
            acceptanceCriteria: story.acceptanceCriteria,
            priority: story.priority,
            passes: story.passes,
            notes: story.notes
          }));
          const metadata: PrdMetadata = {
            project: prd.project,
            description: prd.description,
            branchName: prd.branchName,
          };
          setPrd(stories, metadata, activeProjectId);
          setStatus("ready");
        }
      } catch (error) {
        // Only set error if we're still on the same project
        if (loadingProjectIdRef.current === activeProjectId) {
          console.error("Failed to load PRD:", error);
          setStatus("error");
        }
      }
    }

    loadPrd();
  }, [activeProjectId, activeProject?.path, setPrd, clearPrd, setStatus, selectStory, loadedProjectId]);

  // Show agent run view if a process is selected
  if (selectedProcess) {
    return (
      <Suspense fallback={<ViewFallback />}>
        <AgentRunView process={selectedProcess} />
      </Suspense>
    );
  }

  // Show idea detail view if an idea is selected
  if (selectedIdea) {
    return (
      <Suspense fallback={<ViewFallback />}>
        <IdeaDetailView idea={selectedIdea} />
      </Suspense>
    );
  }

  // Show project view if a project is active
  if (activeProject) {
    return (
      <Suspense fallback={<ViewFallback />}>
        <ProjectView project={activeProject} />
      </Suspense>
    );
  }

  // Show empty state
  return (
    <main className="flex-1 h-screen flex flex-col bg-background-secondary border-t border-border">
      <div className="h-12 drag-region border-b border-border" />
      
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <div className="w-14 h-14 mx-auto mb-4 rounded-lg bg-card border border-border flex items-center justify-center">
            <svg 
              className="w-7 h-7 text-muted" 
              fill="none" 
              stroke="currentColor" 
              viewBox="0 0 24 24"
            >
              <path 
                strokeLinecap="round" 
                strokeLinejoin="round" 
                strokeWidth={1.5} 
                d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" 
              />
            </svg>
          </div>
          <h2 className="text-base font-medium text-foreground mb-1">
            No Project Selected
          </h2>
          <p className="text-sm text-muted">
            Select a project or idea from the sidebar
          </p>
        </div>
      </div>
    </main>
  );
}
