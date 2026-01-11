import { useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useProjectStore } from "../stores/projectStore";
import { usePrdStore, type Story } from "../stores/prdStore";
import { ProjectView } from "./ProjectView";

export function MainContent() {
  const projects = useProjectStore((state) => state.projects);
  const activeProjectId = useProjectStore((state) => state.activeProjectId);
  const activeProject = projects.find((p) => p.id === activeProjectId);

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
        const stories = await invoke<Story[] | null>("load_prd", {
          projectPath: activeProject.path,
        });

        if (stories) {
          setStories(stories);
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
  }, [activeProject?.path, setStories, setStatus]);

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
