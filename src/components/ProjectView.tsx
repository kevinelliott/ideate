import { useState } from "react";
import type { Project } from "../stores/projectStore";
import { usePrdStore } from "../stores/prdStore";
import type { Story } from "../stores/prdStore";
import { usePrdGeneration } from "../hooks/usePrdGeneration";
import { useProjectState } from "../hooks/useProjectState";
import { StoryList } from "./StoryList";
import { AgentSettings } from "./AgentSettings";
import { BuildControls } from "./BuildControls";
import { LogPanel } from "./LogPanel";
import { StoryDetailPanel } from "./StoryDetailPanel";
import { EditStoryModal } from "./EditStoryModal";
import { IdeaInputView } from "./IdeaInputView";

interface ProjectViewProps {
  project: Project;
}

export function ProjectView({ project }: ProjectViewProps) {
  const stories = usePrdStore((state) => state.stories);
  const selectedStoryId = usePrdStore((state) => state.selectedStoryId);
  const status = usePrdStore((state) => state.status);
  const selectStory = usePrdStore((state) => state.selectStory);
  const updateStory = usePrdStore((state) => state.updateStory);
  const savePrd = usePrdStore((state) => state.savePrd);
  const setStatus = usePrdStore((state) => state.setStatus);
  const hasStories = stories.length > 0;
  
  const selectedStory = stories.find((s) => s.id === selectedStoryId);
  const [editingStory, setEditingStory] = useState<Story | null>(null);
  const [generationError, setGenerationError] = useState<string | null>(null);

  const { generatePrd } = usePrdGeneration();

  useProjectState(project.path);

  const handleCloseInspector = () => {
    selectStory(null);
  };

  const handleEditFromInspector = (story: Story) => {
    setEditingStory(story);
  };

  const handleCloseEdit = () => {
    setEditingStory(null);
  };

  const handleSaveEdit = async (updates: Partial<Story>) => {
    if (editingStory) {
      updateStory(editingStory.id, updates);
      await savePrd(project.path);
    }
  };

  const handleGeneratePrd = async (idea: string) => {
    setGenerationError(null);
    const success = await generatePrd(idea, project.name, project.path);
    if (!success) {
      setGenerationError("PRD generation failed. Check the logs for details.");
    }
  };

  const handleRetryGeneration = () => {
    setGenerationError(null);
    setStatus("idle");
  };

  return (
    <div className="flex flex-1 h-screen">
      <main className="flex-1 h-screen overflow-auto p-8 bg-background">
        <div className="max-w-3xl mx-auto">
          <h1 className="text-2xl font-semibold text-foreground mb-2">
            {project.name}
          </h1>
          <p className="text-secondary mb-8">{project.description}</p>

          {hasStories ? (
            <>
              <AgentSettings projectPath={project.path} />
              <BuildControls projectPath={project.path} />
              <LogPanel />
              <StoryList projectPath={project.path} />
            </>
          ) : (
            <>
              <AgentSettings projectPath={project.path} />
              <LogPanel />
              
              {status === "error" && generationError && (
                <div className="mb-6 p-4 rounded-xl bg-red-500/10 border border-red-500/20">
                  <div className="flex items-start gap-3">
                    <svg
                      className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={1.5}
                        d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                      />
                    </svg>
                    <div className="flex-1">
                      <p className="text-red-400 text-sm font-medium mb-2">
                        {generationError}
                      </p>
                      <button
                        onClick={handleRetryGeneration}
                        className="btn btn-sm"
                      >
                        <svg
                          className="w-4 h-4 mr-1.5"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={1.5}
                            d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                          />
                        </svg>
                        Try Again
                      </button>
                    </div>
                  </div>
                </div>
              )}
              
              <IdeaInputView
                projectName={project.name}
                projectDescription={project.description}
                projectPath={project.path}
                onGeneratePrd={handleGeneratePrd}
              />
            </>
          )}
        </div>
      </main>
      
      {selectedStory && (
        <StoryDetailPanel
          story={selectedStory}
          onClose={handleCloseInspector}
          onEdit={handleEditFromInspector}
        />
      )}

      <EditStoryModal
        isOpen={editingStory !== null}
        story={editingStory}
        onClose={handleCloseEdit}
        onSave={handleSaveEdit}
      />
    </div>
  );
}
