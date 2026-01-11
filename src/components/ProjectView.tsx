import { useState } from "react";
import type { Project } from "../stores/projectStore";
import { usePrdStore } from "../stores/prdStore";
import type { Story } from "../stores/prdStore";
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
  const selectStory = usePrdStore((state) => state.selectStory);
  const updateStory = usePrdStore((state) => state.updateStory);
  const savePrd = usePrdStore((state) => state.savePrd);
  const setStatus = usePrdStore((state) => state.setStatus);
  const hasStories = stories.length > 0;
  
  const selectedStory = stories.find((s) => s.id === selectedStoryId);
  const [editingStory, setEditingStory] = useState<Story | null>(null);

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
    setStatus("generating");
    // PRD generation will be handled in US-018
    // For now, just show the loading state and log the idea
    console.log("Generating PRD for idea:", idea);
    // The actual agent spawning will be implemented in US-018
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
