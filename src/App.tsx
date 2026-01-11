import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { Sidebar } from "./components/Sidebar";
import { MainContent } from "./components/MainContent";
import { NewProjectModal } from "./components/NewProjectModal";
import { useProjectStore } from "./stores/projectStore";
import { useBuildStore } from "./stores/buildStore";
import { useKeyboardNavigation } from "./hooks/useKeyboardNavigation";

interface CreateProjectResult {
  path: string;
  config_path: string;
}

interface AgentOutputPayload {
  process_id: string;
  stream_type: "stdout" | "stderr";
  content: string;
}

interface AgentExitPayload {
  process_id: string;
  exit_code: number | null;
  success: boolean;
}

function App() {
  const [showNewProjectModal, setShowNewProjectModal] = useState(false);
  const addProject = useProjectStore((state) => state.addProject);
  const loadProjects = useProjectStore((state) => state.loadProjects);
  const isLoaded = useProjectStore((state) => state.isLoaded);
  const appendLog = useBuildStore((state) => state.appendLog);
  const handleProcessExit = useBuildStore((state) => state.handleProcessExit);

  useKeyboardNavigation({
    onNewProject: () => setShowNewProjectModal(true),
    isModalOpen: showNewProjectModal,
    onCloseModal: () => setShowNewProjectModal(false),
  });

  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  useEffect(() => {
    const unlistenOutputPromise = listen<AgentOutputPayload>("agent-output", (event) => {
      const { process_id, stream_type, content } = event.payload;
      appendLog(stream_type, content, process_id);
    });

    const unlistenExitPromise = listen<AgentExitPayload>("agent-exit", (event) => {
      const { process_id, exit_code, success } = event.payload;
      handleProcessExit({
        processId: process_id,
        exitCode: exit_code,
        success,
      });
    });

    return () => {
      unlistenOutputPromise.then((unlisten) => unlisten());
      unlistenExitPromise.then((unlisten) => unlisten());
    };
  }, [appendLog, handleProcessExit]);

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
