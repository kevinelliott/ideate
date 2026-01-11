import { useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useProjectStore } from "../stores/projectStore";
import { usePrdStore, type Story, type PrdMetadata } from "../stores/prdStore";
import { ProjectView } from "./ProjectView";

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

export function MainContent() {
  const projects = useProjectStore((state) => state.projects);
  const activeProjectId = useProjectStore((state) => state.activeProjectId);
  const activeProject = projects.find((p) => p.id === activeProjectId);

  const setPrd = usePrdStore((state) => state.setPrd);
  const setStories = usePrdStore((state) => state.setStories);
  const setStatus = usePrdStore((state) => state.setStatus);

  useEffect(() => {
    async function loadPrd() {
      if (!activeProject?.path) {
        setStories([]);
        setStatus("idle");
        return;
      }

      try {
        const prd = await invoke<Prd | null>("load_prd", {
          projectPath: activeProject.path,
        });

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
          setPrd(stories, metadata);
          setStatus("ready");
        } else {
          setStories([]);
          setStatus("idle");
        }
      } catch (error) {
        console.error("Failed to load PRD:", error);
        setStories([]);
        setStatus("error");
      }
    }

    loadPrd();
  }, [activeProject?.path, setPrd, setStories, setStatus]);

  if (activeProject) {
    return <ProjectView project={activeProject} />;
  }

  return (
    <main className="flex-1 h-screen flex items-center justify-center bg-background">
      <div className="text-center">
        <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-card border border-border flex items-center justify-center">
          <svg 
            className="w-8 h-8 text-secondary" 
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
        <h2 className="text-lg font-medium text-foreground mb-1">
          No Project Selected
        </h2>
        <p className="text-sm text-secondary">
          Select a project from the sidebar or create a new one
        </p>
      </div>
    </main>
  );
}
