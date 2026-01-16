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
import { usePanelStore } from "./stores/panelStore";
import { useProcessStore } from "./stores/processStore";
import { useIntegrationsStore } from "./stores/integrationsStore";
import { useKeyboardNavigation } from "./hooks/useKeyboardNavigation";
import { useWindowState } from "./hooks/useWindowState";
import { usePrdGeneration } from "./hooks/usePrdGeneration";

import { notify } from "./utils/notify";
import { ErrorBoundary } from "./components/ErrorBoundary";

// Lazy load modals - they are only shown on user interaction
const NewProjectModal = lazy(() => import("./components/NewProjectModal").then(m => ({ default: m.NewProjectModal })));
const ImportProjectModal = lazy(() => import("./components/ImportProjectModal").then(m => ({ default: m.ImportProjectModal })));
const PermissionsModal = lazy(() => import("./components/PermissionsModal").then(m => ({ default: m.PermissionsModal })));
const WelcomeGuideModal = lazy(() => import("./components/WelcomeGuideModal").then(m => ({ default: m.WelcomeGuideModal })));
const DisclaimerModal = lazy(() => import("./components/DisclaimerModal").then(m => ({ default: m.DisclaimerModal })));
const CommandPalette = lazy(() => import("./components/CommandPalette").then(m => ({ default: m.CommandPalette })));

interface CreateProjectResult {
  path: string;
  configPath: string;
}

interface AgentOutputPayload {
  processId: string;
  streamType: "stdout" | "stderr";
  content: string;
}

interface AgentExitPayload {
  processId: string;
  exitCode: number | null;
  success: boolean;
}

interface Preferences {
  defaultAgent: string | null;
  defaultAutonomy: string;
  logBufferSize: number;
  agentPaths: Array<{ agentId: string; path: string }>;
  theme: string;
  hasSeenWelcomeGuide?: boolean;
  hasAcceptedDisclaimer?: boolean;
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
  const [showPermissionsModal, setShowPermissionsModal] = useState(false);
  const [showWelcomeGuide, setShowWelcomeGuide] = useState(false);
  const [showDisclaimer, setShowDisclaimer] = useState(false);
  const [showCommandPalette, setShowCommandPalette] = useState(false);
  const [preferencesLoaded, setPreferencesLoaded] = useState(false);
  const [pendingPrdGeneration, setPendingPrdGeneration] = useState<{projectId: string, projectPath: string, projectName: string} | null>(null);
  
  const addProject = useProjectStore((state) => state.addProject);
  const setActiveProject = useProjectStore((state) => state.setActiveProject);
  const loadProjects = useProjectStore((state) => state.loadProjects);
  const isLoaded = useProjectStore((state) => state.isLoaded);
  const loadTheme = useThemeStore((state) => state.loadTheme);
  const isThemeLoaded = useThemeStore((state) => state.isLoaded);
  const setDefaultAgentId = useAgentStore((state) => state.setDefaultAgentId);
  const initSession = useAgentStore((state) => state.initSession);
  const loadPromptOverrides = usePromptStore((state) => state.loadOverrides);
  const loadPanelStates = usePanelStore((state) => state.loadPanelStates);
  const isPanelStatesLoaded = usePanelStore((state) => state.isLoaded);

  // Track and persist window state
  useWindowState();
  
  // Initialize PRD generation hook at App level so event listeners are always mounted
  usePrdGeneration();

  const isAnyModalOpen = showNewProjectModal || showImportProjectModal || showPermissionsModal || showWelcomeGuide || showDisclaimer || showCommandPalette;

  useKeyboardNavigation({
    onNewProject: () => setShowNewProjectModal(true),
    onOpenSettings: () => window.dispatchEvent(new CustomEvent('open-settings')),
    onOpenCommandPalette: () => setShowCommandPalette(true),
    isModalOpen: isAnyModalOpen,
    onCloseModal: () => {
      setShowNewProjectModal(false);
      setShowImportProjectModal(false);
      setShowPermissionsModal(false);
      setShowWelcomeGuide(false);
      setShowCommandPalette(false);
    },
  });

  const loadIdeas = useIdeasStore((state) => state.loadIdeas);
  const loadIntegrationsConfig = useIntegrationsStore((state) => state.loadConfig);

  useEffect(() => {
    loadProjects();
    loadTheme();
    loadPromptOverrides();
    loadIdeas();
    loadPanelStates();
    loadIntegrationsConfig();
    
    // Load preferences to set default agent and check first-run
    invoke<Preferences | null>("load_preferences")
      .then((prefs) => {
        if (prefs?.defaultAgent) {
          setDefaultAgentId(prefs.defaultAgent);
        }
        // Show disclaimer on first run (before welcome guide)
        if (!prefs?.hasAcceptedDisclaimer) {
          setShowDisclaimer(true);
        } else if (!prefs?.hasSeenWelcomeGuide) {
          // Show welcome guide only if disclaimer already accepted
          setShowWelcomeGuide(true);
        }
        setPreferencesLoaded(true);
      })
      .catch((error) => {
        console.error("Failed to load preferences:", error);
        // Show disclaimer if we can't load preferences (first run)
        setShowDisclaimer(true);
        setPreferencesLoaded(true);
      });
  }, [loadProjects, loadTheme, setDefaultAgentId, loadPromptOverrides, loadIdeas, loadPanelStates, loadIntegrationsConfig]);

  // Listen for native menu event to show welcome guide
  useEffect(() => {
    const unlistenPromise = listen("show-welcome-guide", () => {
      setShowWelcomeGuide(true);
    });

    return () => {
      unlistenPromise.then((unlisten) => unlisten());
    };
  }, []);

  // Global listener for agent output and exit events
  // This handles both buildStore processes (build/chat/prd) and processStore processes (detection/dev-server)
  // Note: We set up the listener once and use getState() inside to get fresh state on each event
  useEffect(() => {
    // Helper to find which project a process belongs to in buildStore
    // Uses getState() to always get the current state, not a stale closure
    const findProjectByProcessId = (processId: string): string | null => {
      const currentProjectStates = useBuildStore.getState().projectStates;
      for (const [projectId, state] of Object.entries(currentProjectStates)) {
        if (state.currentProcessId === processId) {
          return projectId;
        }
      }
      return null;
    };

    const unlistenOutputPromise = listen<AgentOutputPayload>("agent-output", (event) => {
      const { processId, streamType, content } = event.payload;
      
      // Always append to processStore if the process is registered there
      // This ensures process history has complete logs
      const processStoreProcess = useProcessStore.getState().getProcess(processId);
      if (processStoreProcess) {
        useProcessStore.getState().appendProcessLog(processId, streamType, content);
      }
      
      // Also append to buildStore if this is a build process (for the build log panel)
      const buildProjectId = findProjectByProcessId(processId);
      if (buildProjectId) {
        useBuildStore.getState().appendLog(buildProjectId, streamType, content, processId);
      }
    });

    const unlistenExitPromise = listen<AgentExitPayload>("agent-exit", (event) => {
      const { processId, exitCode, success } = event.payload;
      
      // Check if this is a buildStore process and update build state
      const buildProjectId = findProjectByProcessId(processId);
      if (buildProjectId) {
        useBuildStore.getState().handleProcessExit(buildProjectId, {
          processId: processId,
          exitCode: exitCode,
          success,
        });
        // Note: The hooks (useBuildLoop, usePrdGeneration) call unregisterProcess
        // with proper exit info, so process history is saved there.
        return;
      }
      
      // For processStore processes (dev-server, detection), unregister them
      // Note: The specific hooks also handle this, but having it here ensures
      // cleanup even if the hook is unmounted
      const processStoreProcess = useProcessStore.getState().getProcess(processId);
      if (processStoreProcess) {
        useProcessStore.getState().unregisterProcess(processId, exitCode, success);
      }
    });

    return () => {
      unlistenOutputPromise.then((unlisten) => unlisten());
      unlistenExitPromise.then((unlisten) => unlisten());
    };
  }, []); // Empty deps - we use getState() to always get fresh state

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

  const handleAcceptDisclaimer = async () => {
    try {
      // Load current preferences, update, and save
      const prefs = await invoke<Preferences | null>("load_preferences");
      await invoke("save_preferences", {
        preferences: {
          ...prefs,
          hasAcceptedDisclaimer: true,
        },
      });
      setShowDisclaimer(false);
      // Show welcome guide after accepting disclaimer if not seen
      if (!prefs?.hasSeenWelcomeGuide) {
        setShowWelcomeGuide(true);
      }
    } catch (error) {
      console.error("Failed to save disclaimer acceptance:", error);
      // Still dismiss the modal even if save fails
      setShowDisclaimer(false);
    }
  };

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
      notify.success("Project created", `${name} is ready to go`);
    } catch (error) {
      const errorMessage = String(error);
      if (errorMessage.includes("Operation not permitted") || errorMessage.includes("os error 1")) {
        setShowPermissionsModal(true);
      } else {
        console.error("Failed to create project:", error);
        notify.error("Failed to create project", errorMessage);
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
      notify.success("Project imported", `${name} is ready to go`);

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
        notify.error("Failed to import project", errorMessage);
      }
    }
  };

  if (!isLoaded || !isThemeLoaded || !preferencesLoaded || !isPanelStatesLoaded) {
    return (
      <div className="flex h-screen bg-background text-foreground items-center justify-center">
        <div className="text-secondary">Loading...</div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-background text-foreground">
      <ErrorBoundary>
        <Sidebar onNewProject={handleNewProject} onImportProject={handleImportProject} />
      </ErrorBoundary>
      <ErrorBoundary>
        <MainContent />
      </ErrorBoundary>
      
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
        {showDisclaimer && (
          <DisclaimerModal
            isOpen={showDisclaimer}
            onAccept={handleAcceptDisclaimer}
          />
        )}
        {showCommandPalette && (
          <CommandPalette
            isOpen={showCommandPalette}
            onClose={() => setShowCommandPalette(false)}
            onNewProject={handleNewProject}
            onImportProject={handleImportProject}
          />
        )}
      </Suspense>
    </div>
  );
}

export default App;
