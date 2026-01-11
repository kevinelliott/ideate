import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { Sidebar } from "./components/Sidebar";
import { MainContent } from "./components/MainContent";
import { NewProjectModal } from "./components/NewProjectModal";
import { useProjectStore } from "./stores/projectStore";
import { useBuildStore } from "./stores/buildStore";

interface CreateProjectResult {
  path: string;
  config_path: string;
}

interface AgentOutputPayload {
  process_id: string;
  stream_type: "stdout" | "stderr";
  content: string;
}

function App() {
  const [showNewProjectModal, setShowNewProjectModal] = useState(false);
  const addProject = useProjectStore((state) => state.addProject);
  const loadProjects = useProjectStore((state) => state.loadProjects);
  const isLoaded = useProjectStore((state) => state.isLoaded);
  const appendLog = useBuildStore((state) => state.appendLog);

  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  useEffect(() => {
    const unlistenPromise = listen<AgentOutputPayload>("agent-output", (event) => {
      const { stream_type, content } = event.payload;
      appendLog(stream_type, content);
    });

    return () => {
      unlistenPromise.then((unlisten) => unlisten());
    };
  }, [appendLog]);

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

  if (!isLoaded) {
    return (
      <div className="flex h-screen bg-background text-foreground items-center justify-center">
        <div className="text-secondary">Loading...</div>
      </div>
    );
  }

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
