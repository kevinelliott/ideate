import { useEffect, useState, lazy, Suspense } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { Sidebar } from "./components/Sidebar";
import { MainContent } from "./components/MainContent";
import { useProjectStore } from "./stores/projectStore";
import { useBuildStore } from "./stores/buildStore";
import { useThemeStore } from "./stores/themeStore";
import { useAgentStore } from "./stores/agentStore";
import { usePromptStore } from "./stores/promptStore";
import { useIdeasStore } from "./stores/ideasStore";
import { useKeyboardNavigation } from "./hooks/useKeyboardNavigation";

// Lazy load modals - they are only shown on user interaction
const NewProjectModal = lazy(() => import("./components/NewProjectModal").then(m => ({ default: m.NewProjectModal })));
const ImportProjectModal = lazy(() => import("./components/ImportProjectModal").then(m => ({ default: m.ImportProjectModal })));
const PreferencesWindow = lazy(() => import("./components/PreferencesWindow").then(m => ({ default: m.PreferencesWindow })));
const PermissionsModal = lazy(() => import("./components/PermissionsModal").then(m => ({ default: m.PermissionsModal })));
const WelcomeGuideModal = lazy(() => import("./components/WelcomeGuideModal").then(m => ({ default: m.WelcomeGuideModal })));

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

interface Preferences {
  defaultAgent: string | null;
  defaultAutonomy: string;
  logBufferSize: number;
  agentPaths: Array<{ agentId: string; path: string }>;
  theme: string;
  hasSeenWelcomeGuide?: boolean;
}

// Loading fallback for modals
function ModalFallback() {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-card rounded-lg p-6">
        <div className="text-muted">Loading...</div>
      </div>
    </div>
  );
}

function App() {
  const [showNewProjectModal, setShowNewProjectModal] = useState(false);
  const [showImportProjectModal, setShowImportProjectModal] = useState(false);
  const [showPreferencesWindow, setShowPreferencesWindow] = useState(false);
  const [showPermissionsModal, setShowPermissionsModal] = useState(false);
  const [showWelcomeGuide, setShowWelcomeGuide] = useState(false);
  const [preferencesLoaded, setPreferencesLoaded] = useState(false);
  const [pendingPrdGeneration, setPendingPrdGeneration] = useState<{projectId: string, projectPath: string, projectName: string} | null>(null);
  
  const addProject = useProjectStore((state) => state.addProject);
  const setActiveProject = useProjectStore((state) => state.setActiveProject);
  const loadProjects = useProjectStore((state) => state.loadProjects);
  const isLoaded = useProjectStore((state) => state.isLoaded);
  const appendLog = useBuildStore((state) => state.appendLog);
  const handleProcessExit = useBuildStore((state) => state.handleProcessExit);
  const projectStates = useBuildStore((state) => state.projectStates);
  const loadTheme = useThemeStore((state) => state.loadTheme);
  const isThemeLoaded = useThemeStore((state) => state.isLoaded);
  const setDefaultAgentId = useAgentStore((state) => state.setDefaultAgentId);
  const initSession = useAgentStore((state) => state.initSession);
  const loadPromptOverrides = usePromptStore((state) => state.loadOverrides);

  const isAnyModalOpen = showNewProjectModal || showImportProjectModal || showPreferencesWindow || showPermissionsModal || showWelcomeGuide;

  useKeyboardNavigation({
    onNewProject: () => setShowNewProjectModal(true),
    onOpenPreferences: () => setShowPreferencesWindow(true),
    isModalOpen: isAnyModalOpen,
    onCloseModal: () => {
      setShowNewProjectModal(false);
      setShowImportProjectModal(false);
      setShowPreferencesWindow(false);
      setShowPermissionsModal(false);
      setShowWelcomeGuide(false);
    },
  });

  const loadIdeas = useIdeasStore((state) => state.loadIdeas);

  useEffect(() => {
    loadProjects();
    loadTheme();
    loadPromptOverrides();
    loadIdeas();
    
    // Load preferences to set default agent and check first-run
    invoke<Preferences | null>("load_preferences")
      .then((prefs) => {
        if (prefs?.defaultAgent) {
          setDefaultAgentId(prefs.defaultAgent);
        }
        // Show welcome guide on first run
        if (!prefs?.hasSeenWelcomeGuide) {
          setShowWelcomeGuide(true);
        }
        setPreferencesLoaded(true);
      })
      .catch((error) => {
        console.error("Failed to load preferences:", error);
        // Show welcome guide if we can't load preferences (first run)
        setShowWelcomeGuide(true);
        setPreferencesLoaded(true);
      });
  }, [loadProjects, loadTheme, setDefaultAgentId, loadPromptOverrides, loadIdeas]);

  // Listen for native menu event to show welcome guide
  useEffect(() => {
    const unlistenPromise = listen("show-welcome-guide", () => {
      setShowWelcomeGuide(true);
    });

    return () => {
      unlistenPromise.then((unlisten) => unlisten());
    };
  }, []);

  useEffect(() => {
    // Helper to find which project a process belongs to
    const findProjectByProcessId = (processId: string): string | null => {
      for (const [projectId, state] of Object.entries(projectStates)) {
        if (state.currentProcessId === processId) {
          return projectId;
        }
      }
      return null;
    };

    const unlistenOutputPromise = listen<AgentOutputPayload>("agent-output", (event) => {
      const { process_id, stream_type, content } = event.payload;
      const projectId = findProjectByProcessId(process_id);
      if (projectId) {
        appendLog(projectId, stream_type, content, process_id);
      }
    });

    const unlistenExitPromise = listen<AgentExitPayload>("agent-exit", (event) => {
      const { process_id, exit_code, success } = event.payload;
      const projectId = findProjectByProcessId(process_id);
      if (projectId) {
        handleProcessExit(projectId, {
          processId: process_id,
          exitCode: exit_code,
          success,
        });
      }
    });

    return () => {
      unlistenOutputPromise.then((unlisten) => unlisten());
      unlistenExitPromise.then((unlisten) => unlisten());
    };
  }, [appendLog, handleProcessExit, projectStates]);

  // Trigger PRD generation after import if needed
  useEffect(() => {
    if (pendingPrdGeneration) {
      const { projectId, projectPath, projectName } = pendingPrdGeneration;
      // Dispatch event for PRD generation from codebase
      window.dispatchEvent(new CustomEvent('generate-prd-from-codebase', {
        detail: { projectId, projectPath, projectName }
      }));
      setPendingPrdGeneration(null);
    }
  }, [pendingPrdGeneration]);

  const handleNewProject = () => {
    setShowNewProjectModal(true);
  };

  const handleImportProject = () => {
    setShowImportProjectModal(true);
  };

  const handleCloseNewProjectModal = () => {
    setShowNewProjectModal(false);
  };

  const handleCloseImportProjectModal = () => {
    setShowImportProjectModal(false);
  };

  const handleClosePreferencesWindow = () => {
    setShowPreferencesWindow(false);
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
        parentPath: directory,
      });

      const newProject = addProject({
        name,
        description,
        path: result.path,
        status: "idle",
      });

      // Set the new project as active
      setActiveProject(newProject.id);

      // Initialize the agent session with the default agent
      initSession(newProject.id);

      setShowNewProjectModal(false);
    } catch (error) {
      const errorMessage = String(error);
      if (errorMessage.includes("Operation not permitted") || errorMessage.includes("os error 1")) {
        setShowPermissionsModal(true);
      } else {
        console.error("Failed to create project:", error);
      }
    }
  };

  const handleImportExistingProject = async (name: string, directory: string, generatePrd: boolean) => {
    try {
      const result = await invoke<CreateProjectResult>("import_project", {
        name,
        projectPath: directory,
      });

      const newProject = addProject({
        name,
        description: "Imported existing project",
        path: result.path,
        status: "idle",
      });

      // Set the imported project as active BEFORE triggering PRD generation
      // This ensures the PRD is associated with the correct project
      setActiveProject(newProject.id);

      // Initialize the agent session with the default agent
      initSession(newProject.id);

      setShowImportProjectModal(false);

      // If PRD generation is requested, trigger it after import
      // Use setTimeout to ensure the active project state has propagated
      if (generatePrd) {
        setTimeout(() => {
          setPendingPrdGeneration({
            projectId: newProject.id,
            projectPath: result.path,
            projectName: name,
          });
        }, 100);
      }
    } catch (error) {
      const errorMessage = String(error);
      if (errorMessage.includes("Operation not permitted") || errorMessage.includes("os error 1")) {
        setShowPermissionsModal(true);
      } else {
        console.error("Failed to import project:", error);
      }
    }
  };

  if (!isLoaded || !isThemeLoaded || !preferencesLoaded) {
    return (
      <div className="flex h-screen bg-background text-foreground items-center justify-center">
        <div className="text-secondary">Loading...</div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-background text-foreground">
      <Sidebar onNewProject={handleNewProject} onImportProject={handleImportProject} />
      <MainContent />
      
      {/* Lazy loaded modals - only render when open */}
      <Suspense fallback={<ModalFallback />}>
        {showNewProjectModal && (
          <NewProjectModal
            isOpen={showNewProjectModal}
            onClose={handleCloseNewProjectModal}
            onCreate={handleCreateProject}
          />
        )}
        {showImportProjectModal && (
          <ImportProjectModal
            isOpen={showImportProjectModal}
            onClose={handleCloseImportProjectModal}
            onImport={handleImportExistingProject}
          />
        )}
        {showPreferencesWindow && (
          <PreferencesWindow
            isOpen={showPreferencesWindow}
            onClose={handleClosePreferencesWindow}
          />
        )}
        {showPermissionsModal && (
          <PermissionsModal
            isOpen={showPermissionsModal}
            onClose={() => setShowPermissionsModal(false)}
          />
        )}
        {showWelcomeGuide && (
          <WelcomeGuideModal
            isOpen={showWelcomeGuide}
            onClose={() => setShowWelcomeGuide(false)}
          />
        )}
      </Suspense>
    </div>
  );
}

export default App;
