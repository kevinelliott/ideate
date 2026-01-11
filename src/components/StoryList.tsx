import { usePrdStore } from "../stores/prdStore";
import { StoryCard } from "./StoryCard";

export function StoryList() {
  const stories = usePrdStore((state) => state.stories);

  const handleStoryClick = (storyId: string) => {
    console.log("Story clicked:", storyId);
  };

  if (stories.length === 0) {
    return null;
  }

  return (
    <div className="space-y-3">
      {stories.map((story) => (
        <StoryCard key={story.id} story={story} onClick={handleStoryClick} />
      ))}
    </div>
  );
}
