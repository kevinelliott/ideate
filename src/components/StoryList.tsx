import { useState } from "react";
import { usePrdStore } from "../stores/prdStore";
import type { Story } from "../stores/prdStore";
import { StoryCard } from "./StoryCard";
import { EditStoryModal } from "./EditStoryModal";
import { CreateStoryModal } from "./CreateStoryModal";

interface StoryListProps {
  projectPath: string;
}

export function StoryList({ projectPath }: StoryListProps) {
  const stories = usePrdStore((state) => state.stories);
  const updateStory = usePrdStore((state) => state.updateStory);
  const addStory = usePrdStore((state) => state.addStory);
  const savePrd = usePrdStore((state) => state.savePrd);
  
  const [editingStory, setEditingStory] = useState<Story | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  const handleStoryClick = (storyId: string) => {
    console.log("Story clicked:", storyId);
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

  const getNextPriority = (): number => {
    if (stories.length === 0) return 1;
    const maxPriority = Math.max(...stories.map((s) => s.priority));
    return maxPriority + 1;
  };

  return (
    <>
      <div className="space-y-3">
        {stories.map((story) => (
          <StoryCard
            key={story.id}
            story={story}
            onClick={handleStoryClick}
            onEdit={handleEditStory}
          />
        ))}
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
    </>
  );
}
