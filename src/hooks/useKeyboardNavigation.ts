import { useEffect, useCallback, useState } from "react";
import { useProjectStore } from "../stores/projectStore";
import { usePrdStore } from "../stores/prdStore";

type NavigationContext = "projects" | "stories";

interface UseKeyboardNavigationProps {
  onNewProject: () => void;
  onOpenPreferences: () => void;
  isModalOpen: boolean;
  onCloseModal: () => void;
}

export function useKeyboardNavigation({
  onNewProject,
  onOpenPreferences,
  isModalOpen,
  onCloseModal,
}: UseKeyboardNavigationProps) {
  const projects = useProjectStore((state) => state.projects);
  const activeProjectId = useProjectStore((state) => state.activeProjectId);
  const setActiveProject = useProjectStore((state) => state.setActiveProject);

  const stories = usePrdStore((state) => state.stories);
  const selectedStoryId = usePrdStore((state) => state.selectedStoryId);
  const selectStory = usePrdStore((state) => state.selectStory);

  const [navigationContext, setNavigationContext] = useState<NavigationContext>("projects");

  const sortedStories = [...stories].sort((a, b) => a.priority - b.priority);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape" && isModalOpen) {
        e.preventDefault();
        onCloseModal();
        return;
      }

      if ((e.metaKey || e.ctrlKey) && e.key === "n" && !isModalOpen) {
        e.preventDefault();
        onNewProject();
        return;
      }

      if ((e.metaKey || e.ctrlKey) && e.key === "," && !isModalOpen) {
        e.preventDefault();
        onOpenPreferences();
        return;
      }

      if (isModalOpen) return;

      const activeElement = document.activeElement;
      const isInputFocused =
        activeElement instanceof HTMLInputElement ||
        activeElement instanceof HTMLTextAreaElement ||
        activeElement?.getAttribute("contenteditable") === "true";
      if (isInputFocused) return;

      if (e.key === "Tab") {
        e.preventDefault();
        if (activeProjectId && sortedStories.length > 0) {
          setNavigationContext((prev) =>
            prev === "projects" ? "stories" : "projects"
          );
        }
        return;
      }

      if (e.key === "ArrowUp" || e.key === "ArrowDown") {
        e.preventDefault();

        if (navigationContext === "projects" && projects.length > 0) {
          const currentIndex = projects.findIndex((p) => p.id === activeProjectId);
          let newIndex: number;

          if (e.key === "ArrowUp") {
            if (currentIndex <= 0) {
              newIndex = projects.length - 1;
            } else {
              newIndex = currentIndex - 1;
            }
          } else {
            if (currentIndex >= projects.length - 1 || currentIndex === -1) {
              newIndex = 0;
            } else {
              newIndex = currentIndex + 1;
            }
          }

          setActiveProject(projects[newIndex].id);
        } else if (navigationContext === "stories" && sortedStories.length > 0) {
          const currentIndex = sortedStories.findIndex((s) => s.id === selectedStoryId);
          let newIndex: number;

          if (e.key === "ArrowUp") {
            if (currentIndex <= 0) {
              newIndex = sortedStories.length - 1;
            } else {
              newIndex = currentIndex - 1;
            }
          } else {
            if (currentIndex >= sortedStories.length - 1 || currentIndex === -1) {
              newIndex = 0;
            } else {
              newIndex = currentIndex + 1;
            }
          }

          selectStory(sortedStories[newIndex].id);
        }
        return;
      }

      if (e.key === "Enter") {
        e.preventDefault();

        if (navigationContext === "projects") {
          if (!activeProjectId && projects.length > 0) {
            setActiveProject(projects[0].id);
          } else if (activeProjectId && sortedStories.length > 0) {
            setNavigationContext("stories");
            if (!selectedStoryId) {
              selectStory(sortedStories[0].id);
            }
          }
        } else if (navigationContext === "stories") {
          if (!selectedStoryId && sortedStories.length > 0) {
            selectStory(sortedStories[0].id);
          }
        }
        return;
      }
    },
    [
      projects,
      activeProjectId,
      setActiveProject,
      sortedStories,
      selectedStoryId,
      selectStory,
      navigationContext,
      isModalOpen,
      onNewProject,
      onOpenPreferences,
      onCloseModal,
    ]
  );

  useEffect(() => {
    if (!activeProjectId) {
      setNavigationContext("projects");
    }
  }, [activeProjectId]);

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [handleKeyDown]);

  return { navigationContext };
}
