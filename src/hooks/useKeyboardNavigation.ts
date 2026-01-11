import { useEffect, useCallback } from "react";
import { useProjectStore } from "../stores/projectStore";

interface UseKeyboardNavigationProps {
  onNewProject: () => void;
  isModalOpen: boolean;
  onCloseModal: () => void;
}

export function useKeyboardNavigation({
  onNewProject,
  isModalOpen,
  onCloseModal,
}: UseKeyboardNavigationProps) {
  const projects = useProjectStore((state) => state.projects);
  const activeProjectId = useProjectStore((state) => state.activeProjectId);
  const setActiveProject = useProjectStore((state) => state.setActiveProject);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      // Escape closes modals
      if (e.key === "Escape" && isModalOpen) {
        e.preventDefault();
        onCloseModal();
        return;
      }

      // Cmd+N opens new project modal (not when modal is open)
      if ((e.metaKey || e.ctrlKey) && e.key === "n" && !isModalOpen) {
        e.preventDefault();
        onNewProject();
        return;
      }

      // Skip arrow/enter navigation if modal is open or no projects
      if (isModalOpen || projects.length === 0) return;

      // Skip if focus is on an input, textarea, or contenteditable
      const activeElement = document.activeElement;
      const isInputFocused =
        activeElement instanceof HTMLInputElement ||
        activeElement instanceof HTMLTextAreaElement ||
        activeElement?.getAttribute("contenteditable") === "true";
      if (isInputFocused) return;

      // Up/Down arrows navigate project list
      if (e.key === "ArrowUp" || e.key === "ArrowDown") {
        e.preventDefault();

        const currentIndex = projects.findIndex((p) => p.id === activeProjectId);
        let newIndex: number;

        if (e.key === "ArrowUp") {
          if (currentIndex <= 0) {
            newIndex = projects.length - 1; // Wrap to end
          } else {
            newIndex = currentIndex - 1;
          }
        } else {
          if (currentIndex >= projects.length - 1 || currentIndex === -1) {
            newIndex = 0; // Wrap to start
          } else {
            newIndex = currentIndex + 1;
          }
        }

        setActiveProject(projects[newIndex].id);
        return;
      }

      // Enter selects highlighted project (when nothing is selected yet)
      if (e.key === "Enter" && !activeProjectId && projects.length > 0) {
        e.preventDefault();
        setActiveProject(projects[0].id);
        return;
      }
    },
    [projects, activeProjectId, setActiveProject, isModalOpen, onNewProject, onCloseModal]
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [handleKeyDown]);
}
