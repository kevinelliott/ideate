import { useState } from "react";
import { usePrdStore } from "../stores/prdStore";
import type { Story } from "../stores/prdStore";
import { StoryCard } from "./StoryCard";
import { EditStoryModal } from "./EditStoryModal";

interface StoryListProps {
  projectPath: string;
}

export function StoryList({ projectPath }: StoryListProps) {
  const stories = usePrdStore((state) => state.stories);
  const updateStory = usePrdStore((state) => state.updateStory);
  const savePrd = usePrdStore((state) => state.savePrd);
  
  const [editingStory, setEditingStory] = useState<Story | null>(null);

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

  if (stories.length === 0) {
    return null;
  }

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
      </div>
      <EditStoryModal
        isOpen={editingStory !== null}
        story={editingStory}
        onClose={handleCloseEdit}
        onSave={handleSaveEdit}
      />
    </>
  );
}
