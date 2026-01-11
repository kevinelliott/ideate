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

interface ProjectViewProps {
  project: Project;
}

export function ProjectView({ project }: ProjectViewProps) {
  const stories = usePrdStore((state) => state.stories);
  const selectedStoryId = usePrdStore((state) => state.selectedStoryId);
  const selectStory = usePrdStore((state) => state.selectStory);
  const updateStory = usePrdStore((state) => state.updateStory);
  const savePrd = usePrdStore((state) => state.savePrd);
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

  return (
    <div className="flex flex-1 h-screen">
      <main className="flex-1 h-screen overflow-auto p-8 bg-background">
        <div className="max-w-3xl mx-auto">
          <h1 className="text-2xl font-semibold text-foreground mb-2">
            {project.name}
          </h1>
          <p className="text-secondary mb-8">{project.description}</p>

          <AgentSettings projectPath={project.path} />

          {hasStories ? (
            <>
              <BuildControls projectPath={project.path} />
              <LogPanel />
              <StoryList projectPath={project.path} />
            </>
          ) : (
            <div className="border border-border rounded-xl bg-card p-8 text-center">
              <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-background border border-border flex items-center justify-center">
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
                    d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                  />
                </svg>
              </div>
              <h2 className="text-lg font-medium text-foreground mb-1">
                No PRD generated yet
              </h2>
              <p className="text-sm text-secondary mb-6">
                Generate a PRD to break down your idea into user stories
              </p>
              <button className="px-4 py-2 bg-accent text-white rounded-lg font-medium hover:opacity-90 transition-opacity">
                Generate PRD
              </button>
            </div>
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
