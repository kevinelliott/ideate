import { useState, lazy, Suspense } from "react";
import type { Project } from "../stores/projectStore";
import { usePrdStore } from "../stores/prdStore";
import type { Story } from "../stores/prdStore";
import { usePrdGeneration } from "../hooks/usePrdGeneration";
import { useProjectState } from "../hooks/useProjectState";
import { useBuildLoop } from "../hooks/useBuildLoop";
import { useBuildStore } from "../stores/buildStore";
import { StoryList } from "./StoryList";
import { ProjectTopBar } from "./ProjectTopBar";
import { BuildControls } from "./BuildControls";
import { IdeaInputView } from "./IdeaInputView";
import { EditStoryModal } from "./EditStoryModal";

// Lazy load heavy panel components
const LogPanel = lazy(() => import("./LogPanel").then(m => ({ default: m.LogPanel })));
const AgentPanel = lazy(() => import("./AgentPanel").then(m => ({ default: m.AgentPanel })));
const TerminalPanel = lazy(() => import("./TerminalPanel").then(m => ({ default: m.TerminalPanel })));
const PreviewPanel = lazy(() => import("./PreviewPanel").then(m => ({ default: m.PreviewPanel })));
const StoryDetailPanel = lazy(() => import("./StoryDetailPanel").then(m => ({ default: m.StoryDetailPanel })));

interface ProjectViewProps {
  project: Project;
}

// Minimal fallback for panels
function PanelFallback() {
  return <div className="h-8 bg-card/50 animate-pulse" />;
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
  
  const getProjectState = useBuildStore((state) => state.getProjectState);
  const buildState = getProjectState(project.id);
  const buildHasStarted = buildState.status !== 'idle' || Object.keys(buildState.storyStatuses).length > 0 || stories.some(s => s.passes);
  
  const selectedStory = stories.find((s) => s.id === selectedStoryId);
  const [editingStory, setEditingStory] = useState<Story | null>(null);
  const [generationError, setGenerationError] = useState<string | null>(null);

  const { generatePrd } = usePrdGeneration();

  useBuildLoop(project.id, project.path);
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

  const handleGeneratePrd = async (idea: string, agentId: string) => {
    setGenerationError(null);
    const success = await generatePrd(idea, project.name, project.path, agentId);
    if (!success) {
      setGenerationError("PRD generation failed. Check the logs for details.");
    }
  };

  const handleRetryGeneration = () => {
    setGenerationError(null);
    setStatus("idle");
  };

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
        
        {hasStories ? (
          /* Stories view - scrollable content area */
          <div className="flex-1 overflow-auto p-6 min-h-0 scrollbar-auto-hide">
            <div className="max-w-4xl mx-auto">
              <div className="space-y-4">
                <BuildControls projectId={project.id} projectPath={project.path} />
                <StoryList projectId={project.id} projectPath={project.path} />
              </div>
            </div>
          </div>
        ) : (
          /* Idea input view - centered */
          <div className="flex-1 flex items-center justify-center p-6 min-h-0 overflow-auto scrollbar-auto-hide">
            <div className="w-full max-w-xl">
              {status === "error" && generationError && (
                <div className="p-4 rounded-lg bg-destructive/10 border border-destructive/20 mb-6">
                  <div className="flex items-start gap-3">
                    <svg
                      className="w-5 h-5 text-destructive flex-shrink-0 mt-0.5"
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
                      <p className="text-destructive text-sm font-medium mb-3">
                        {generationError}
                      </p>
                      <button
                        onClick={handleRetryGeneration}
                        className="btn btn-sm btn-secondary"
                      >
                        <svg
                          className="w-4 h-4"
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
                projectId={project.id}
                projectName={project.name}
                projectDescription={project.description}
                projectPath={project.path}
                onGeneratePrd={handleGeneratePrd}
              />
            </div>
          </div>
        )}

        {/* Bottom panels - lazy loaded */}
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
      
      {selectedStory && (
        <Suspense fallback={null}>
          <StoryDetailPanel
            story={selectedStory}
            onClose={handleCloseInspector}
            onEdit={handleEditFromInspector}
          />
        </Suspense>
      )}

      {/* Preview panel - show once build has started */}
      {hasStories && buildHasStarted && (
        <Suspense fallback={null}>
          <PreviewPanel projectId={project.id} projectPath={project.path} />
        </Suspense>
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
