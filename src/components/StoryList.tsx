import { useState } from "react";
import { usePrdStore } from "../stores/prdStore";
import { useBuildStore } from "../stores/buildStore";
import type { Story } from "../stores/prdStore";
import { StoryCard } from "./StoryCard";
import { EditStoryModal } from "./EditStoryModal";
import { CreateStoryModal } from "./CreateStoryModal";
import { ConfirmDeleteModal } from "./ConfirmDeleteModal";
import { PreviousLogsPanel } from "./PreviousLogsPanel";

interface StoryListProps {
  projectPath: string;
}

export function StoryList({ projectPath }: StoryListProps) {
  const stories = usePrdStore((state) => state.stories);
  const updateStory = usePrdStore((state) => state.updateStory);
  const addStory = usePrdStore((state) => state.addStory);
  const removeStory = usePrdStore((state) => state.removeStory);
  const savePrd = usePrdStore((state) => state.savePrd);
  const selectStory = usePrdStore((state) => state.selectStory);
  const selectedStoryId = usePrdStore((state) => state.selectedStoryId);
  
  const retryStory = useBuildStore((state) => state.retryStory);
  const storyRetries = useBuildStore((state) => state.storyRetries);
  
  const [editingStory, setEditingStory] = useState<Story | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [deletingStory, setDeletingStory] = useState<Story | null>(null);
  const [viewingLogsStoryId, setViewingLogsStoryId] = useState<string | null>(null);

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
      await savePrd(projectPath);
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
    await savePrd(projectPath);
  };

  const handleDeleteStory = (story: Story) => {
    setDeletingStory(story);
  };

  const handleConfirmDelete = async () => {
    if (deletingStory) {
      removeStory(deletingStory.id);
      await savePrd(projectPath);
      setDeletingStory(null);
    }
  };

  const handleCancelDelete = () => {
    setDeletingStory(null);
  };

  const handleRetryStory = (story: Story) => {
    retryStory(story.id);
  };

  const handleViewPreviousLogs = (storyId: string) => {
    setViewingLogsStoryId(viewingLogsStoryId === storyId ? null : storyId);
  };

  const getNextPriority = (): number => {
    if (stories.length === 0) return 1;
    const maxPriority = Math.max(...stories.map((s) => s.priority));
    return maxPriority + 1;
  };

  const sortedStories = [...stories].sort((a, b) => a.priority - b.priority);

  return (
    <>
      <div className="space-y-3 mt-6">
        {sortedStories.map((story) => {
          const retryInfo = storyRetries[story.id];
          const hasPreviousLogs = retryInfo && retryInfo.previousLogs.length > 0;
          
          return (
            <div key={story.id}>
              <StoryCard
                story={story}
                isSelected={story.id === selectedStoryId}
                onClick={handleStoryClick}
                onEdit={handleEditStory}
                onDelete={handleDeleteStory}
                onRetry={handleRetryStory}
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
          className="w-full py-3 px-4 rounded-xl border border-dashed border-border hover:border-accent hover:bg-accent/5 text-secondary hover:text-accent transition-colors flex items-center justify-center gap-2"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="18"
            height="18"
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
          <span className="font-medium">Add Story</span>
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
    </>
  );
}
