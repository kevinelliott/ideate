import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Sidebar } from "./components/Sidebar";
import { MainContent } from "./components/MainContent";
import { NewProjectModal } from "./components/NewProjectModal";
import { useProjectStore } from "./stores/projectStore";

interface CreateProjectResult {
  path: string;
  config_path: string;
}

function App() {
  const [showNewProjectModal, setShowNewProjectModal] = useState(false);
  const addProject = useProjectStore((state) => state.addProject);

  const handleNewProject = () => {
    setShowNewProjectModal(true);
  };

  const handleCloseModal = () => {
    setShowNewProjectModal(false);
  };

  const handleCreateProject = async (name: string, description: string, directory: string | null) => {
    if (!directory) {
      console.error("No directory selected");
      return;
    }

    try {
      const result = await invoke<CreateProjectResult>("create_project", {
        name,
        description,
        directory,
      });

      addProject({
        name,
        description,
        path: result.path,
        status: "idle",
      });

      setShowNewProjectModal(false);
    } catch (error) {
      console.error("Failed to create project:", error);
    }
  };

  return (
    <div className="flex h-screen bg-background text-foreground">
      <Sidebar onNewProject={handleNewProject} />
      <MainContent />
      <NewProjectModal
        isOpen={showNewProjectModal}
        onClose={handleCloseModal}
        onCreate={handleCreateProject}
      />
    </div>
  );
}

export default App;
