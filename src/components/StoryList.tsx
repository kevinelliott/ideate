import { useState } from "react";
import { usePrdStore } from "../stores/prdStore";
import { useBuildStore } from "../stores/buildStore";
import type { Story } from "../stores/prdStore";
import { StoryCard } from "./StoryCard";
import { EditStoryModal } from "./EditStoryModal";
import { CreateStoryModal } from "./CreateStoryModal";
import { ConfirmDeleteModal } from "./ConfirmDeleteModal";
import { PreviousLogsPanel } from "./PreviousLogsPanel";
import { GenerateStoriesModal } from "./GenerateStoriesModal";
import { RegeneratePrdModal } from "./RegeneratePrdModal";
import { usePrdGeneration } from "../hooks/usePrdGeneration";
import { useProjectStore } from "../stores/projectStore";

interface StoryListProps {
  projectId: string;
  projectPath: string;
}

type SortField = "priority" | "id" | "title";
type SortDirection = "asc" | "desc";

export function StoryList({ projectId, projectPath }: StoryListProps) {
  const stories = usePrdStore((state) => state.stories);
  const updateStory = usePrdStore((state) => state.updateStory);
  const addStory = usePrdStore((state) => state.addStory);
  const removeStory = usePrdStore((state) => state.removeStory);
  const savePrd = usePrdStore((state) => state.savePrd);
  const selectStory = usePrdStore((state) => state.selectStory);
  const selectedStoryId = usePrdStore((state) => state.selectedStoryId);
  const prdStatus = usePrdStore((state) => state.status);
  
  const retryStory = useBuildStore((state) => state.retryStory);
  const pauseBuild = useBuildStore((state) => state.pauseBuild);
  const projectState = useBuildStore((state) => state.projectStates[projectId]);
  const storyRetries = projectState?.storyRetries ?? {};
  
  const projects = useProjectStore((state) => state.projects);
  const project = projects.find(p => p.id === projectId);
  
  const { generateAdditionalStories, generatePrdFromCodebase } = usePrdGeneration();
  
  const [editingStory, setEditingStory] = useState<Story | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [deletingStory, setDeletingStory] = useState<Story | null>(null);
  const [viewingLogsStoryId, setViewingLogsStoryId] = useState<string | null>(null);
  const [sortField, setSortField] = useState<SortField>("priority");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [isGenerateModalOpen, setIsGenerateModalOpen] = useState(false);
  const [isRegenerateModalOpen, setIsRegenerateModalOpen] = useState(false);
  const [draggedStoryId, setDraggedStoryId] = useState<string | null>(null);
  const [dragOverStoryId, setDragOverStoryId] = useState<string | null>(null);
  
  const reorderStories = usePrdStore((state) => state.reorderStories);

  const handleStoryClick = (storyId: string) => {
    selectStory(storyId === selectedStoryId ? null : storyId);
  };

  const handleEditStory = (story: Story) => {
    setEditingStory(story);
  };

  const handleCloseEdit = () => {
    setEditingStory(null);
  };

  const handleSaveEdit = async (updates: Partial<Story>) => {
    if (editingStory) {
      updateStory(editingStory.id, updates);
      await savePrd(projectId, projectPath);
    }
  };

  const handleOpenCreate = () => {
    setIsCreating(true);
  };

  const handleCloseCreate = () => {
    setIsCreating(false);
  };

  const handleCreateStory = async (storyData: Omit<Story, "id">) => {
    addStory(storyData);
    await savePrd(projectId, projectPath);
  };

  const handleDeleteStory = (story: Story) => {
    setDeletingStory(story);
  };

  const handleConfirmDelete = async () => {
    if (deletingStory) {
      removeStory(deletingStory.id);
      await savePrd(projectId, projectPath);
      setDeletingStory(null);
    }
  };

  const handleCancelDelete = () => {
    setDeletingStory(null);
  };

  const handleRetryStory = (story: Story) => {
    retryStory(projectId, story.id);
  };

  const handlePlayStory = (story: Story) => {
    window.dispatchEvent(new CustomEvent('story-play', { 
      detail: { projectId, storyId: story.id } 
    }));
  };

  const handlePauseBuild = () => {
    pauseBuild(projectId);
  };

  const handleViewPreviousLogs = (storyId: string) => {
    setViewingLogsStoryId(viewingLogsStoryId === storyId ? null : storyId);
  };

  const handleSortChange = (field: SortField) => {
    if (field === sortField) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
  };

  const handleDragStart = (e: React.DragEvent, story: Story) => {
    setDraggedStoryId(story.id);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", story.id);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };

  const handleDragEnter = (storyId: string) => {
    if (draggedStoryId && draggedStoryId !== storyId) {
      setDragOverStoryId(storyId);
    }
  };

  const handleDragLeave = () => {
    setDragOverStoryId(null);
  };

  const handleDrop = async (e: React.DragEvent, targetStory: Story) => {
    e.preventDefault();
    if (!draggedStoryId || draggedStoryId === targetStory.id) {
      setDraggedStoryId(null);
      setDragOverStoryId(null);
      return;
    }

    const fromIndex = sortedStories.findIndex((s) => s.id === draggedStoryId);
    const toIndex = sortedStories.findIndex((s) => s.id === targetStory.id);

    if (fromIndex !== -1 && toIndex !== -1) {
      const actualFromIndex = stories.findIndex((s) => s.id === draggedStoryId);
      const actualToIndex = stories.findIndex((s) => s.id === targetStory.id);
      reorderStories(actualFromIndex, actualToIndex);
      await savePrd(projectId, projectPath);
    }

    setDraggedStoryId(null);
    setDragOverStoryId(null);
  };

  const handleDragEnd = () => {
    setDraggedStoryId(null);
    setDragOverStoryId(null);
  };

  const isDragEnabled = sortField === "priority" && sortDirection === "asc";

  const handleOpenGenerateModal = () => {
    setIsGenerateModalOpen(true);
  };

  const handleCloseGenerateModal = () => {
    if (prdStatus !== 'generating') {
      setIsGenerateModalOpen(false);
    }
  };

  const handleDismissGenerateModal = () => {
    setIsGenerateModalOpen(false);
  };

  const handleGenerateStories = (request: string) => {
    if (!project) return;
    
    generateAdditionalStories(
      projectId,
      project.name,
      projectPath,
      request
    );
  };

  const handleOpenRegenerateModal = () => {
    setIsRegenerateModalOpen(true);
  };

  const handleCloseRegenerateModal = () => {
    if (prdStatus !== 'generating') {
      setIsRegenerateModalOpen(false);
    }
  };

  const handleDismissRegenerateModal = () => {
    setIsRegenerateModalOpen(false);
  };

  const handleRegeneratePrd = () => {
    if (!project) return;
    
    generatePrdFromCodebase(
      projectId,
      project.name,
      projectPath
    );
  };

  const getNextPriority = (): number => {
    if (stories.length === 0) return 1;
    const maxPriority = Math.max(...stories.map((s) => s.priority));
    return maxPriority + 1;
  };

  const sortedStories = [...stories].sort((a, b) => {
    let comparison = 0;
    
    switch (sortField) {
      case "priority":
        comparison = a.priority - b.priority;
        break;
      case "id":
        comparison = a.id.localeCompare(b.id, undefined, { numeric: true });
        break;
      case "title":
        comparison = a.title.localeCompare(b.title);
        break;
    }
    
    return sortDirection === "asc" ? comparison : -comparison;
  });

  const SortButton = ({ field, label }: { field: SortField; label: string }) => {
    const isActive = sortField === field;
    return (
      <button
        onClick={() => handleSortChange(field)}
        className={`flex items-center gap-1 px-2 py-1 text-xs rounded transition-colors ${
          isActive
            ? "text-accent bg-accent/10"
            : "text-muted hover:text-foreground hover:bg-card"
        }`}
      >
        {label}
        {isActive && (
          <svg
            className={`w-3 h-3 transition-transform ${sortDirection === "desc" ? "rotate-180" : ""}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
          </svg>
        )}
      </button>
    );
  };

  const isGenerating = prdStatus === 'generating';

  return (
    <>
      {/* Sort controls and action buttons */}
      <div className="flex items-center justify-between mt-4 mb-3">
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted">Sort by:</span>
          <SortButton field="priority" label="Priority" />
          <SortButton field="id" label="ID" />
          <SortButton field="title" label="Title" />
          {isDragEnabled && (
            <span className="text-xs text-muted ml-2 flex items-center gap-1">
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
              </svg>
              Drag to reorder
            </span>
          )}
        </div>
        
        <div className="flex items-center gap-2">
          {/* Regenerate PRD button */}
          <button
            onClick={handleOpenRegenerateModal}
            disabled={isGenerating}
            className="p-1.5 rounded-lg border border-border text-muted hover:text-foreground hover:bg-card transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            title="Regenerate PRD from codebase"
          >
            <svg
              className={`w-4 h-4 ${isGenerating ? 'animate-spin' : ''}`}
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
          </button>

          {/* AI Generate button */}
          <button
            onClick={handleOpenGenerateModal}
            disabled={isGenerating}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-gradient-to-r from-purple-500/10 to-pink-500/10 border border-purple-500/20 text-purple-400 hover:from-purple-500/20 hover:to-pink-500/20 hover:border-purple-500/30 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            title="Generate additional stories with AI"
          >
            <svg
              className={`w-4 h-4 ${isGenerating ? 'animate-spin' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456z"
              />
            </svg>
            <span className="text-xs font-medium">AI Generate</span>
          </button>
        </div>
      </div>

      <div className="space-y-3">
        {sortedStories.map((story) => {
          const retryInfo = storyRetries[story.id];
          const hasPreviousLogs = retryInfo && retryInfo.previousLogs.length > 0;
          
          return (
            <div 
              key={story.id}
              onDragEnter={() => handleDragEnter(story.id)}
            >
              <StoryCard
                projectId={projectId}
                story={story}
                isSelected={story.id === selectedStoryId}
                isDragging={draggedStoryId === story.id}
                isDragOver={dragOverStoryId === story.id}
                onClick={handleStoryClick}
                onEdit={handleEditStory}
                onDelete={handleDeleteStory}
                onRetry={handleRetryStory}
                onPlay={handlePlayStory}
                onPause={handlePauseBuild}
                onDragStart={isDragEnabled ? handleDragStart : undefined}
                onDragOver={isDragEnabled ? handleDragOver : undefined}
                onDragLeave={isDragEnabled ? handleDragLeave : undefined}
                onDrop={isDragEnabled ? handleDrop : undefined}
                onDragEnd={isDragEnabled ? handleDragEnd : undefined}
              />
              {hasPreviousLogs && (
                <div className="mt-1 ml-4">
                  <button
                    onClick={() => handleViewPreviousLogs(story.id)}
                    className="text-xs text-secondary hover:text-foreground flex items-center gap-1 transition-colors"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="12"
                      height="12"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className={`transform transition-transform ${viewingLogsStoryId === story.id ? "rotate-90" : ""}`}
                    >
                      <path d="m9 18 6-6-6-6" />
                    </svg>
                    View previous attempt logs ({retryInfo.previousLogs.length})
                  </button>
                  {viewingLogsStoryId === story.id && (
                    <PreviousLogsPanel previousLogs={retryInfo.previousLogs} />
                  )}
                </div>
              )}
            </div>
          );
        })}
        <button
          onClick={handleOpenCreate}
          className="w-full py-3 px-4 rounded-lg border border-dashed border-border hover:border-accent hover:bg-accent/5 text-secondary hover:text-accent transition-colors flex items-center justify-center gap-2"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M12 5v14" />
            <path d="M5 12h14" />
          </svg>
          <span className="text-sm font-medium">Add Story</span>
        </button>
      </div>
      <EditStoryModal
        isOpen={editingStory !== null}
        story={editingStory}
        onClose={handleCloseEdit}
        onSave={handleSaveEdit}
      />
      <CreateStoryModal
        isOpen={isCreating}
        nextPriority={getNextPriority()}
        onClose={handleCloseCreate}
        onSave={handleCreateStory}
      />
      <ConfirmDeleteModal
        isOpen={deletingStory !== null}
        storyId={deletingStory?.id ?? ""}
        onConfirm={handleConfirmDelete}
        onCancel={handleCancelDelete}
      />
      <GenerateStoriesModal
        isOpen={isGenerateModalOpen}
        isGenerating={isGenerating}
        onClose={handleCloseGenerateModal}
        onGenerate={handleGenerateStories}
        onDismiss={handleDismissGenerateModal}
      />
      <RegeneratePrdModal
        isOpen={isRegenerateModalOpen}
        isRegenerating={isGenerating}
        storyCount={stories.length}
        onClose={handleCloseRegenerateModal}
        onConfirm={handleRegeneratePrd}
        onDismiss={handleDismissRegenerateModal}
      />
    </>
  );
}
