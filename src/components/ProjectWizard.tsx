import { useState, useEffect, useRef } from "react";
import { open, save } from "@tauri-apps/plugin-dialog";
import { documentDir, homeDir } from "@tauri-apps/api/path";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useModalKeyboard } from "../hooks/useModalKeyboard";
import { useProjectStore } from "../stores/projectStore";
import { usePrdStore } from "../stores/prdStore";
import { useAgentStore } from "../stores/agentStore";
import { useBuildStore } from "../stores/buildStore";
import { useIdeaGeneration } from "../hooks/useIdeaGeneration";
import { useIdeasStore } from "../stores/ideasStore";
import { usePromptStore } from "../stores/promptStore";
import { defaultPlugins } from "../types";
import { jsPDF } from "jspdf";

type WizardPhase = 
  | "idea" 
  | "idea-review"
  | "location" 
  | "planning" 
  | "review" 
  | "specs"
  | "specs-generating"
  | "specs-preview"
  | "design"
  | "designing"
  | "design-preview"
  | "ready";

interface WizardStep {
  phase: WizardPhase;
  title: string;
  description: string;
}

const WIZARD_STEPS: WizardStep[] = [
  { phase: "idea", title: "Idea", description: "Describe what you want to build" },
  { phase: "idea-review", title: "Refine", description: "Review your generated idea" },
  { phase: "location", title: "Location", description: "Choose where to create your project" },
  { phase: "planning", title: "Plan", description: "AI is creating your roadmap" },
  { phase: "review", title: "Review", description: "Review your project plan" },
  { phase: "specs", title: "Specs", description: "Generate technical specifications" },
  { phase: "specs-generating", title: "Specs", description: "AI is creating specifications" },
  { phase: "specs-preview", title: "Review", description: "Review specifications" },
  { phase: "design", title: "Design", description: "Generate visual design" },
  { phase: "designing", title: "Design", description: "AI is creating your design" },
  { phase: "design-preview", title: "Preview", description: "Review your design" },
  { phase: "ready", title: "Ready", description: "Start building" },
];

// For progress bar, we only count major visible steps
const VISIBLE_STEP_PHASES: WizardPhase[] = ["idea", "idea-review", "location", "review", "specs", "specs-preview", "design", "design-preview", "ready"];

interface ProjectWizardProps {
  isOpen: boolean;
  onClose: () => void;
}

interface CreateProjectResult {
  path: string;
}

interface DesignDocument {
  project: string;
  version: string;
  generatedAt: string;
  architecture: {
    overview: string;
    components: Array<{
      name: string;
      description: string;
      responsibilities: string[];
    }>;
    dataFlow: string;
  };
  techStack: {
    frontend?: string[];
    backend?: string[];
    database?: string[];
    infrastructure?: string[];
  };
  fileStructure: string;
  apiDesign?: Array<{
    endpoint: string;
    method: string;
    description: string;
  }>;
  dataModels?: Array<{
    name: string;
    fields: string[];
  }>;
  considerations: {
    security?: string[];
    performance?: string[];
    scalability?: string[];
  };
}

// Agent options for idea generation and planning
const IDEA_AGENTS = [
  { id: "amp", name: "Amp", command: "amp", preferred: true },
  { id: "claude-code", name: "Claude Code", command: "claude" },
  { id: "gemini", name: "Gemini CLI", command: "gemini" },
];

// Reuse same agents for PRD/plan generation
const PLAN_AGENTS = IDEA_AGENTS;

// Specs agent options - Amp preferred (with oracle), then Claude Code (with superthink)
const SPECS_AGENTS = [
  { id: "amp", name: "Amp (Recommended)", command: "amp", args: ["--execute"], preferred: true, promptPrefix: "Use the oracle to " },
  { id: "claude-code", name: "Claude Code", command: "claude", args: ["--output-format", "stream-json", "--verbose", "--dangerously-skip-permissions", "-p"], promptPrefix: "superthink " },
  { id: "gemini", name: "Gemini CLI", command: "gemini", args: ["--yolo", "-m", "gemini-2.5-pro"] },
];

// Visual design agent options - Gemini 3 Pro Preview preferred for visual design
const DESIGN_AGENTS = [
  { id: "gemini", name: "Gemini (Recommended)", command: "gemini", args: ["--yolo", "-m", "gemini-2.5-pro"], preferred: true },
  { id: "claude-code", name: "Claude Code", command: "claude", args: ["--output-format", "stream-json", "--verbose", "--dangerously-skip-permissions", "-p"] },
  { id: "amp", name: "Amp", command: "amp", args: ["--execute"] },
];

// Visual design options
const DESIGN_OPTIONS = [
  { id: "skip", name: "Skip for now", description: "Start building without visual design" },
  { id: "minimal", name: "Minimal", description: "Clean, simple styling with sensible defaults" },
  { id: "modern", name: "Modern", description: "Contemporary design with smooth animations" },
  { id: "beautiful", name: "Modern & Beautiful", description: "Polished, visually stunning with attention to detail" },
  { id: "custom", name: "Custom prompt", description: "Describe your own visual style" },
];

export function ProjectWizard({ isOpen, onClose }: ProjectWizardProps) {
  const [currentPhase, setCurrentPhase] = useState<WizardPhase>("idea");
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [description, setDescription] = useState("");
  const [isEditingIdea, setIsEditingIdea] = useState(false);
  const [showIdeaModal, setShowIdeaModal] = useState(false);
  const [selectedIdeaAgent, setSelectedIdeaAgent] = useState<string>("amp");
  const [showIdeaAgentDropdown, setShowIdeaAgentDropdown] = useState(false);
  const [selectedPlanAgent, setSelectedPlanAgent] = useState<string>("amp");
  const [showPlanAgentDropdown, setShowPlanAgentDropdown] = useState(false);
  const [selectedDirectory, setSelectedDirectory] = useState<string | null>(null);
  const [pathValidationTrigger, setPathValidationTrigger] = useState(0);
  const [isValidPath, setIsValidPath] = useState(true);
  const [isCreatingProject, setIsCreatingProject] = useState(false);
  const [createdProjectId, setCreatedProjectId] = useState<string | null>(null);
  const [createdProjectPath, setCreatedProjectPath] = useState<string | null>(null);
  const [planningProgress, setPlanningProgress] = useState(0);
  const [planningMessage, setPlanningMessage] = useState("Initializing...");
  const [error, setError] = useState<string | null>(null);
  const [errorTitle, setErrorTitle] = useState<string>("Error");
  const [showErrorModal, setShowErrorModal] = useState(false);
  
  // Specs phase state (architectural/technical specifications)
  const [selectedSpecsAgent, setSelectedSpecsAgent] = useState<string>("gemini");
  const [specsProgress, setSpecsProgress] = useState(0);
  const [specsMessage, setSpecsMessage] = useState("Initializing...");
  const [designDocument, setDesignDocument] = useState<DesignDocument | null>(null);
  const [isGeneratingSpecs, setIsGeneratingSpecs] = useState(false);
  const [showLogs, setShowLogs] = useState(false);
  const [showAllStories, setShowAllStories] = useState(false);
  
  // Visual design phase state
  const [selectedDesignOption, setSelectedDesignOption] = useState<string>("minimal");
  const [selectedDesignAgent, setSelectedDesignAgent] = useState<string>("gemini");
  const [customDesignPrompt, setCustomDesignPrompt] = useState("");
  const [designProgress, setDesignProgress] = useState(0);
  const [designMessage, setDesignMessage] = useState("Initializing...");
  const [isGeneratingDesign, setIsGeneratingDesign] = useState(false);
  const [generatedDesignFiles, setGeneratedDesignFiles] = useState<string[]>([]);
  const [showDesignPreviewModal, setShowDesignPreviewModal] = useState(false);
  const [designPreviewUrl, setDesignPreviewUrl] = useState<string | null>(null);
  const [previewServerId, setPreviewServerId] = useState<string | null>(null);
  
  // Preferences for wizard defaults
  interface WizardPreferences {
    ideasAgent: string | null;
    prdAgent: string | null;
    specsAgent: string | null;
    designAgent: string | null;
    defaultAgent: string | null;
  }
  const [_wizardPrefs, setWizardPrefs] = useState<WizardPreferences | null>(null);

  const addProject = useProjectStore((state) => state.addProject);
  const setActiveProject = useProjectStore((state) => state.setActiveProject);
  const initSession = useAgentStore((state) => state.initSession);
  const addIdea = useIdeasStore((state) => state.addIdea);
  const getPrompt = usePromptStore((state) => state.getPrompt);
  
  const { generateDescription, isGenerating, generationType } = useIdeaGeneration();
  
  const projectPrd = usePrdStore((state) => 
    createdProjectId ? state.projectPrds[createdProjectId] : null
  );
  const stories = projectPrd?.stories ?? [];
  const prdStatus = projectPrd?.status ?? 'idle';
  
  const projectBuildState = useBuildStore((state) => 
    createdProjectId ? state.projectStates[createdProjectId] : null
  );
  const logs = projectBuildState?.logs ?? [];

  const progressIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const logsEndRef = useRef<HTMLDivElement>(null);
  const specsIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const designIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const ideaAgentDropdownRef = useRef<HTMLDivElement>(null);
  const planAgentDropdownRef = useRef<HTMLDivElement>(null);
  const previewServerIdRef = useRef<string | null>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!showIdeaAgentDropdown) return;
    
    const handleClickOutside = (event: MouseEvent) => {
      if (ideaAgentDropdownRef.current && !ideaAgentDropdownRef.current.contains(event.target as Node)) {
        setShowIdeaAgentDropdown(false);
      }
    };
    
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showIdeaAgentDropdown]);

  // Close plan agent dropdown when clicking outside
  useEffect(() => {
    if (!showPlanAgentDropdown) return;
    
    const handleClickOutside = (event: MouseEvent) => {
      if (planAgentDropdownRef.current && !planAgentDropdownRef.current.contains(event.target as Node)) {
        setShowPlanAgentDropdown(false);
      }
    };
    
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showPlanAgentDropdown]);

  useModalKeyboard(
    isOpen && 
    currentPhase !== "planning" && 
    currentPhase !== "specs-generating" && 
    currentPhase !== "designing" && 
    !isGenerating && 
    !isGeneratingSpecs &&
    !isGeneratingDesign, 
    onClose
  );

  // Load preferences and check which agents are available
  useEffect(() => {
    async function loadPrefsAndCheckAgents() {
      // Load preferences
      let prefs: WizardPreferences | null = null;
      try {
        const loadedPrefs = await invoke<WizardPreferences | null>("load_preferences");
        if (loadedPrefs) {
          prefs = loadedPrefs;
          setWizardPrefs(loadedPrefs);
        }
      } catch {
        // Preferences not available
      }
      
      // Check available agents
      const availableAgents: string[] = [];
      const allAgentIds = ["amp", "claude-code", "gemini"];
      const agentCommands: Record<string, string> = {
        "amp": "amp",
        "claude-code": "claude",
        "gemini": "gemini",
      };
      
      for (const agentId of allAgentIds) {
        try {
          const exists = await invoke<boolean>("check_command_exists", { command: agentCommands[agentId] });
          if (exists) {
            availableAgents.push(agentId);
          }
        } catch {
          // Agent not available
        }
      }
      
      const fallback = prefs?.defaultAgent || "amp";
      
      // Ideas agent: preference > Claude Code if available > fallback
      if (prefs?.ideasAgent && availableAgents.includes(prefs.ideasAgent)) {
        setSelectedIdeaAgent(prefs.ideasAgent);
      } else if (availableAgents.includes("claude-code")) {
        setSelectedIdeaAgent("claude-code");
      } else if (availableAgents.includes(fallback)) {
        setSelectedIdeaAgent(fallback);
      } else if (availableAgents.length > 0) {
        setSelectedIdeaAgent(availableAgents[0]);
      }
      
      // PRD agent: preference > Amp if available > fallback
      if (prefs?.prdAgent && availableAgents.includes(prefs.prdAgent)) {
        setSelectedPlanAgent(prefs.prdAgent);
      } else if (availableAgents.includes("amp")) {
        setSelectedPlanAgent("amp");
      } else if (availableAgents.includes(fallback)) {
        setSelectedPlanAgent(fallback);
      } else if (availableAgents.length > 0) {
        setSelectedPlanAgent(availableAgents[0]);
      }
      
      // Specs agent: preference > Amp (with oracle) if available > Claude Code (with superthink) > fallback
      if (prefs?.specsAgent && availableAgents.includes(prefs.specsAgent)) {
        setSelectedSpecsAgent(prefs.specsAgent);
      } else if (availableAgents.includes("amp")) {
        setSelectedSpecsAgent("amp");
      } else if (availableAgents.includes("claude-code")) {
        setSelectedSpecsAgent("claude-code");
      } else if (availableAgents.includes(fallback)) {
        setSelectedSpecsAgent(fallback);
      } else if (availableAgents.length > 0) {
        setSelectedSpecsAgent(availableAgents[0]);
      } else {
        setSelectedSpecsAgent(SPECS_AGENTS[0].id);
      }
      
      // Design agent: preference > Gemini if available > fallback
      if (prefs?.designAgent && availableAgents.includes(prefs.designAgent)) {
        setSelectedDesignAgent(prefs.designAgent);
      } else if (availableAgents.includes("gemini")) {
        setSelectedDesignAgent("gemini");
      } else if (availableAgents.includes(fallback)) {
        setSelectedDesignAgent(fallback);
      } else if (availableAgents.length > 0) {
        setSelectedDesignAgent(availableAgents[0]);
      }
    }
    if (isOpen) {
      loadPrefsAndCheckAgents();
    }
  }, [isOpen]);

  // Reset wizard when opened / cleanup preview server when closed
  useEffect(() => {
    if (isOpen) {
      setCurrentPhase("idea");
      setTitle("");
      setSummary("");
      setDescription("");
      setIsEditingIdea(false);
      setShowIdeaModal(false);
      setSelectedIdeaAgent("amp");
      setShowIdeaAgentDropdown(false);
      setSelectedPlanAgent("amp");
      setShowPlanAgentDropdown(false);
      setSelectedDirectory(null);
      setIsValidPath(true);
      setIsCreatingProject(false);
      setCreatedProjectId(null);
      setCreatedProjectPath(null);
      setPlanningProgress(0);
      setPlanningMessage("Initializing...");
      setError(null);
      setErrorTitle("Error");
      setShowErrorModal(false);
      setSpecsProgress(0);
      setSpecsMessage("Initializing...");
      setDesignDocument(null);
      setIsGeneratingSpecs(false);
      setShowLogs(false);
      setShowAllStories(false);
      setSelectedDesignOption("minimal");
      setCustomDesignPrompt("");
      setDesignProgress(0);
      setDesignMessage("Initializing...");
      setIsGeneratingDesign(false);
      setGeneratedDesignFiles([]);
      setShowDesignPreviewModal(false);
      setDesignPreviewUrl(null);
      setPreviewServerId(null);
      previewServerIdRef.current = null;
    } else {
      // Cleanup preview server when wizard closes
      if (previewServerIdRef.current) {
        invoke("stop_preview_server", { serverId: previewServerIdRef.current })
          .catch((err) => console.error("Failed to stop preview server on close:", err));
        previewServerIdRef.current = null;
      }
    }
  }, [isOpen]);

  // Validate project path when directory or title changes
  useEffect(() => {
    async function validatePath() {
      if (!selectedDirectory || !title.trim()) {
        setIsValidPath(true);
        return;
      }
      
      const projectPath = `${selectedDirectory}/${title.trim()}`;
      try {
        const exists = await invoke<boolean>("check_directory_exists", { path: projectPath });
        setIsValidPath(!exists);
        if (exists) {
          showError("Project Already Exists", `A project folder already exists at "${projectPath}". Please choose a different name or directory.`);
        }
      } catch (err) {
        console.error("Failed to check path:", err);
        setIsValidPath(true);
      }
    }
    
    validatePath();
  }, [selectedDirectory, title, pathValidationTrigger]);

  // Watch PRD status for planning phase completion
  useEffect(() => {
    if (currentPhase === "planning" && createdProjectId) {
      if (prdStatus === "ready" && stories.length > 0) {
        setPlanningProgress(100);
        setPlanningMessage("Plan complete!");
        setTimeout(() => {
          setCurrentPhase("review");
        }, 500);
      } else if (prdStatus === "error") {
        showError("Plan Generation Failed", "The AI agent failed to generate a project plan. Check the logs for details, then try again with a different agent or refine your idea description.");
        setPlanningProgress(0);
      }
    }
  }, [currentPhase, createdProjectId, prdStatus, stories.length]);

  // Simulate progress during planning
  useEffect(() => {
    if (currentPhase === "planning" && prdStatus === "generating") {
      const messages = [
        "Analyzing your idea...",
        "Identifying key features...",
        "Breaking down into stories...",
        "Defining acceptance criteria...",
        "Prioritizing tasks...",
        "Almost there...",
      ];
      let messageIndex = 0;

      progressIntervalRef.current = setInterval(() => {
        setPlanningProgress((prev) => {
          const next = Math.min(prev + Math.random() * 8, 90);
          return next;
        });
        
        if (messageIndex < messages.length - 1) {
          messageIndex++;
          setPlanningMessage(messages[messageIndex]);
        }
      }, 2000);

      return () => {
        if (progressIntervalRef.current) {
          clearInterval(progressIntervalRef.current);
        }
      };
    }
  }, [currentPhase, prdStatus]);

  // Auto-scroll logs to bottom
  useEffect(() => {
    if (showLogs && logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [logs.length, showLogs]);

  // Simulate progress during specs generation
  useEffect(() => {
    if (currentPhase === "specs-generating" && isGeneratingSpecs) {
      const messages = [
        "Analyzing requirements...",
        "Designing architecture...",
        "Defining components...",
        "Planning data models...",
        "Documenting API design...",
        "Finalizing specifications...",
      ];
      let messageIndex = 0;

      specsIntervalRef.current = setInterval(() => {
        setSpecsProgress((prev: number) => {
          const next = Math.min(prev + Math.random() * 8, 90);
          return next;
        });
        
        if (messageIndex < messages.length - 1) {
          messageIndex++;
          setSpecsMessage(messages[messageIndex]);
        }
      }, 2000);

      return () => {
        if (specsIntervalRef.current) {
          clearInterval(specsIntervalRef.current);
        }
      };
    }
  }, [currentPhase, isGeneratingSpecs]);

  // Simulate progress during design generation
  useEffect(() => {
    if (currentPhase === "designing" && isGeneratingDesign) {
      const messages = [
        "Setting up design environment...",
        "Creating component structure...",
        "Applying visual styles...",
        "Building layout templates...",
        "Adding responsive breakpoints...",
        "Polishing design details...",
      ];
      let messageIndex = 0;

      designIntervalRef.current = setInterval(() => {
        setDesignProgress((prev: number) => {
          const next = Math.min(prev + Math.random() * 8, 90);
          return next;
        });
        
        if (messageIndex < messages.length - 1) {
          messageIndex++;
          setDesignMessage(messages[messageIndex]);
        }
      }, 2000);

      return () => {
        if (designIntervalRef.current) {
          clearInterval(designIntervalRef.current);
        }
      };
    }
  }, [currentPhase, isGeneratingDesign]);

  const handleDirectoryPick = async () => {
    try {
      let defaultPath: string | undefined;
      try {
        defaultPath = await documentDir();
      } catch {
        try {
          defaultPath = await homeDir();
        } catch {
          defaultPath = undefined;
        }
      }

      const selected = await open({
        directory: true,
        multiple: false,
        defaultPath,
        title: "Choose Project Directory",
      });

      if (selected) {
        setSelectedDirectory(selected);
        setPathValidationTrigger((t) => t + 1);
      }
    } catch (error) {
      console.error("Failed to open directory picker:", error);
    }
  };

  const showError = (title: string, message: string) => {
    setErrorTitle(title);
    setError(message);
    setShowErrorModal(true);
  };

  const dismissError = () => {
    setShowErrorModal(false);
    setError(null);
    setErrorTitle("Error");
  };

  const handleGenerateIdea = async (agentId?: string) => {
    if (!title.trim()) return;
    try {
      const result = await generateDescription('generate', title, summary, description, agentId || selectedIdeaAgent);
      if (result) {
        setDescription(result);
        // Save the idea to the Ideas list
        await addIdea({
          title: title.trim(),
          summary: summary.trim(),
          description: result,
        });
      } else {
        showError("Idea Generation Failed", "The AI agent did not return a response. Please try again or select a different agent.");
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      showError("Idea Generation Failed", `Failed to generate idea description: ${message}`);
    }
  };

  const handleStartPlanning = async () => {
    if (!selectedDirectory || !title.trim()) return;

    setIsCreatingProject(true);
    setError(null);
    setPlanningProgress(5);
    setPlanningMessage("Creating project...");

    try {
      const projectName = title.trim();
      const result = await invoke<CreateProjectResult>("create_project", {
        name: projectName,
        description: description.trim() || "",
        parentPath: selectedDirectory,
      });

      // Get default agent
      const defaultAgent = defaultPlugins[0];

      // Save project settings
      await invoke("save_project_settings", {
        projectPath: result.path,
        settings: {
          agent: defaultAgent?.id || null,
          autonomy: "autonomous",
          buildMode: "ralph",
        },
      });

      // Save the idea to the project
      await invoke("save_project_idea", {
        projectPath: result.path,
        idea: {
          title: title.trim(),
          summary: summary.trim(),
          description: description.trim(),
        },
      });

      const newProject = addProject({
        name: projectName,
        description: description.trim() || "",
        path: result.path,
        status: "generating",
      });

      initSession(newProject.id);
      setActiveProject(newProject.id);
      setCreatedProjectId(newProject.id);
      setCreatedProjectPath(result.path);
      setCurrentPhase("planning");
      setIsCreatingProject(false);

      // Start PRD generation
      setPlanningProgress(10);
      setPlanningMessage("Starting AI planning...");

      // Import and use the generation hook's logic via event
      window.dispatchEvent(
        new CustomEvent("wizard-generate-prd", {
          detail: {
            projectId: newProject.id,
            projectName,
            projectPath: result.path,
            ideaTitle: title.trim(),
            ideaSummary: "",
            ideaDescription: description.trim(),
            agentId: selectedPlanAgent,
          },
        })
      );
    } catch (error) {
      console.error("Failed to create project:", error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (errorMessage.includes("already exists")) {
        showError("Project Already Exists", `A project folder already exists at "${selectedDirectory}/${title.trim()}". Please choose a different name or directory.`);
      } else {
        showError("Project Creation Failed", `Failed to create project: ${errorMessage}`);
      }
      setIsCreatingProject(false);
    }
  };

  const handleStartSpecs = async () => {
    if (!createdProjectPath) return;

    setIsGeneratingSpecs(true);
    setCurrentPhase("specs-generating");
    setSpecsProgress(5);
    setSpecsMessage("Starting specifications generation...");
    setError(null);

    // Capture agent output for error reporting
    const outputLines: string[] = [];
    let unlistenOutput: (() => void) | null = null;

    try {
      const agent = SPECS_AGENTS.find(a => a.id === selectedSpecsAgent) || SPECS_AGENTS[0];
      
      // Get the base prompt from the prompt store (allows user customization)
      const storiesText = stories.map(s => `- ${s.id}: ${s.title}`).join('\n');
      const basePrompt = getPrompt('specsGeneration', {
        '{{projectName}}': title,
        '{{description}}': description,
        '{{stories}}': storiesText,
      });
      
      // Add agent-specific prefix for better quality
      const promptPrefix = (agent as { promptPrefix?: string }).promptPrefix || '';
      const designPrompt = promptPrefix + basePrompt;

      let args: string[];
      if (agent.id === "gemini") {
        args = [...agent.args, designPrompt];
      } else if (agent.id === "claude-code") {
        args = [...agent.args, designPrompt];
      } else {
        args = [...agent.args, designPrompt, "--stream-json"];
      }

      interface SpawnAgentResult {
        processId: string;
      }

      interface WaitAgentResult {
        processId: string;
        exitCode: number | null;
        success: boolean;
      }

      interface AgentOutputPayload {
        processId: string;
        streamType: 'stdout' | 'stderr';
        content: string;
      }

      const spawnResult = await invoke<SpawnAgentResult>("spawn_agent", {
        executable: agent.command,
        args,
        workingDirectory: createdProjectPath,
      });

      // Listen for output to capture for error reporting
      unlistenOutput = await listen<AgentOutputPayload>('agent-output', (event) => {
        if (event.payload.processId === spawnResult.processId) {
          outputLines.push(event.payload.content);
          // Keep only last 50 lines to avoid memory issues
          if (outputLines.length > 50) {
            outputLines.shift();
          }
        }
      });

      const waitResult = await invoke<WaitAgentResult>("wait_agent", {
        processId: spawnResult.processId,
      });

      unlistenOutput();
      unlistenOutput = null;

      if (!waitResult.success) {
        // Extract useful error info from output
        const lastLines = outputLines.slice(-10).join('\n').trim();
        const errorDetail = lastLines 
          ? `\n\nAgent output:\n${lastLines}`
          : '';
        throw new Error(`${agent.name} exited with code ${waitResult.exitCode}${errorDetail}`);
      }

      // Load the generated design/specs
      const design = await invoke<DesignDocument | null>("load_design", {
        projectPath: createdProjectPath,
      });

      if (design) {
        setDesignDocument(design);
        setSpecsProgress(100);
        setSpecsMessage("Specifications complete!");
        setTimeout(() => {
          setCurrentPhase("specs-preview");
          setIsGeneratingSpecs(false);
        }, 500);
      } else {
        throw new Error("The agent completed but did not create the design.json file. Check if the agent has write permissions.");
      }
    } catch (error) {
      if (unlistenOutput) unlistenOutput();
      console.error("Failed to generate specifications:", error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      showError("Specs Generation Failed", errorMessage);
      setSpecsProgress(0);
      setIsGeneratingSpecs(false);
      setCurrentPhase("specs");
    }
  };

  const handleStartDesign = async () => {
    if (!createdProjectPath) return;

    setIsGeneratingDesign(true);
    setCurrentPhase("designing");
    setDesignProgress(5);
    setDesignMessage("Starting design generation...");
    setError(null);

    // Capture agent output for error reporting
    const outputLines: string[] = [];
    let unlistenOutput: (() => void) | null = null;

    try {
      const agent = DESIGN_AGENTS.find(a => a.id === selectedDesignAgent) || DESIGN_AGENTS[0];
      
      const styleDescriptions: Record<string, string> = {
        minimal: "Clean, minimal design with lots of whitespace, simple color palette (neutral grays with one accent color), sans-serif typography, subtle shadows, and straightforward layouts.",
        modern: "Contemporary design with smooth animations and transitions, gradient accents, rounded corners, card-based layouts, and modern typography.",
        beautiful: "Visually stunning, polished design with beautiful gradients, micro-interactions, elegant typography, refined color harmonies, attention to detail in spacing and alignment, and premium feel.",
        custom: customDesignPrompt || "Custom visual design based on project requirements.",
      };

      const styleDescription = styleDescriptions[selectedDesignOption] || styleDescriptions.minimal;

      const designPrompt = `You are a frontend designer. Create a minimal-functionality visual design prototype for this project.

PROJECT: ${title}
DESCRIPTION: ${description}
DESIGN STYLE: ${styleDescription}

Create the design files in a "design/" folder at the project root. Generate:
1. design/index.html - Main page with the visual design (HTML + inline CSS or linked CSS)
2. design/styles.css - Complete CSS styling
3. design/components/ - Individual component HTML files if needed

REQUIREMENTS:
- Create a VISUAL PROTOTYPE only - no JavaScript logic, no backend, no actual functionality
- Focus purely on the visual design, layout, and styling
- Include placeholder content that matches the project concept
- Make it look professional and polished
- Include responsive design considerations
- Use the specified design style throughout

The design should demonstrate the visual direction for the full application without implementing any actual features.

IMPORTANT: Only create files in the design/ folder. Do not implement any actual application logic.`;

      let args: string[];
      if (agent.id === "gemini") {
        args = [...agent.args, designPrompt];
      } else if (agent.id === "claude-code") {
        args = [...agent.args, designPrompt];
      } else {
        args = [...agent.args, designPrompt, "--stream-json"];
      }

      interface SpawnAgentResult {
        processId: string;
      }

      interface WaitAgentResult {
        processId: string;
        exitCode: number | null;
        success: boolean;
      }

      interface AgentOutputPayload {
        processId: string;
        streamType: 'stdout' | 'stderr';
        content: string;
      }

      const spawnResult = await invoke<SpawnAgentResult>("spawn_agent", {
        executable: agent.command,
        args,
        workingDirectory: createdProjectPath,
      });

      // Listen for output to capture for error reporting
      unlistenOutput = await listen<AgentOutputPayload>('agent-output', (event) => {
        if (event.payload.processId === spawnResult.processId) {
          outputLines.push(event.payload.content);
          if (outputLines.length > 50) {
            outputLines.shift();
          }
        }
      });

      const waitResult = await invoke<WaitAgentResult>("wait_agent", {
        processId: spawnResult.processId,
      });

      unlistenOutput();
      unlistenOutput = null;

      if (!waitResult.success) {
        const lastLines = outputLines.slice(-10).join('\n').trim();
        const errorDetail = lastLines ? `\n\nAgent output:\n${lastLines}` : '';
        throw new Error(`${agent.name} exited with code ${waitResult.exitCode}${errorDetail}`);
      }

      // List files in the design/ folder
      const designPath = `${createdProjectPath}/design`;
      try {
        const files = await invoke<string[]>("list_directory", { path: designPath });
        setGeneratedDesignFiles(files);
      } catch {
        // design folder might not exist or be empty
        setGeneratedDesignFiles(["index.html", "styles.css"]);
      }

      setDesignProgress(100);
      setDesignMessage("Design complete!");
      setTimeout(() => {
        setCurrentPhase("design-preview");
        setIsGeneratingDesign(false);
      }, 500);
    } catch (error) {
      if (unlistenOutput) unlistenOutput();
      console.error("Failed to generate design:", error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      showError("Design Generation Failed", errorMessage);
      setDesignProgress(0);
      setIsGeneratingDesign(false);
      setCurrentPhase("design");
    }
  };

  const handleFinish = async () => {
    // Stop any running preview server
    if (previewServerId) {
      try {
        await invoke("stop_preview_server", { serverId: previewServerId });
      } catch (error) {
        console.error("Failed to stop preview server:", error);
      }
      setPreviewServerId(null);
      previewServerIdRef.current = null;
    }
    if (createdProjectId) {
      setActiveProject(createdProjectId);
    }
    onClose();
  };

  const handleRegenerateDesign = async () => {
    // Stop preview server before regenerating
    if (previewServerId) {
      try {
        await invoke("stop_preview_server", { serverId: previewServerId });
      } catch (error) {
        console.error("Failed to stop preview server:", error);
      }
      setPreviewServerId(null);
      previewServerIdRef.current = null;
    }
    setDesignPreviewUrl(null);
    setShowDesignPreviewModal(false);
    setCurrentPhase("design");
  };

  interface PreviewServerInfo {
    serverId: string;
    port: number;
    url: string;
  }

  const handleOpenDesignPreview = async () => {
    if (!createdProjectPath) return;
    
    try {
      // Start a preview server for the design folder
      const designPath = `${createdProjectPath}/design`;
      const serverInfo = await invoke<PreviewServerInfo>("start_preview_server", {
        directory: designPath,
        entryFile: "index.html",
      });
      
      setPreviewServerId(serverInfo.serverId);
      previewServerIdRef.current = serverInfo.serverId;
      setDesignPreviewUrl(serverInfo.url);
      setShowDesignPreviewModal(true);
    } catch (error) {
      console.error("Failed to start design preview:", error);
      showError("Preview Failed", "Could not start preview server. The design folder may not exist yet.");
    }
  };

  const handleCloseDesignPreview = async () => {
    // Stop the preview server when closing the modal
    if (previewServerId) {
      try {
        await invoke("stop_preview_server", { serverId: previewServerId });
      } catch (error) {
        console.error("Failed to stop preview server:", error);
      }
      setPreviewServerId(null);
      previewServerIdRef.current = null;
    }
    setDesignPreviewUrl(null);
    setShowDesignPreviewModal(false);
  };

  const handleBack = () => {
    if (currentPhase === "idea-review") {
      setCurrentPhase("idea");
      setIsEditingIdea(false);
    } else if (currentPhase === "location") {
      setCurrentPhase("idea-review");
    } else if (currentPhase === "specs") {
      setCurrentPhase("review");
    } else if (currentPhase === "specs-preview") {
      setCurrentPhase("specs");
    } else if (currentPhase === "design") {
      setCurrentPhase("specs-preview");
    } else if (currentPhase === "design-preview") {
      setCurrentPhase("design");
    }
  };

  const handleNext = () => {
    if (currentPhase === "idea" && title.trim()) {
      // Always generate description from title + summary, then proceed
      handleGenerateIdea().then(() => {
        setCurrentPhase("idea-review");
      });
    } else if (currentPhase === "idea-review") {
      setCurrentPhase("location");
      setIsEditingIdea(false);
    } else if (currentPhase === "location" && selectedDirectory) {
      handleStartPlanning();
    } else if (currentPhase === "review") {
      setCurrentPhase("specs");
    } else if (currentPhase === "specs") {
      handleStartSpecs();
    } else if (currentPhase === "specs-preview") {
      setCurrentPhase("design");
    } else if (currentPhase === "design") {
      // Skip visual design if user chose "skip"
      if (selectedDesignOption === "skip") {
        setCurrentPhase("ready");
      } else {
        // Generate visual design
        handleStartDesign();
      }
    } else if (currentPhase === "design-preview") {
      setCurrentPhase("ready");
    }
  };

  // Calculate progress based on visible steps only
  const getProgressPercent = () => {
    const visibleIndex = VISIBLE_STEP_PHASES.indexOf(currentPhase);
    if (visibleIndex === -1) {
      // For intermediate phases, use the previous visible step + 0.5
      if (currentPhase === "planning") return (VISIBLE_STEP_PHASES.indexOf("location") + 0.5) / VISIBLE_STEP_PHASES.length * 100;
      if (currentPhase === "specs-generating") return (VISIBLE_STEP_PHASES.indexOf("specs") + 0.5) / VISIBLE_STEP_PHASES.length * 100;
      if (currentPhase === "designing") return (VISIBLE_STEP_PHASES.indexOf("design") + 0.5) / VISIBLE_STEP_PHASES.length * 100;
    }
    return ((visibleIndex + 1) / VISIBLE_STEP_PHASES.length) * 100;
  };

  const progressPercent = getProgressPercent();

  const AIButton = ({
    onClick,
    disabled,
    isActive,
    icon,
    label,
    title: buttonTitle,
  }: {
    onClick: () => void;
    disabled: boolean;
    isActive: boolean;
    icon: React.ReactNode;
    label: string;
    title: string;
  }) => (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={buttonTitle}
      className={`flex items-center gap-1.5 px-2 py-1 rounded-md text-xs transition-all ${
        isActive
          ? "bg-accent/20 text-accent border border-accent/30"
          : disabled
          ? "text-muted/50 cursor-not-allowed"
          : "text-muted hover:text-foreground hover:bg-card border border-transparent hover:border-border"
      }`}
    >
      {isActive ? (
        <svg className="w-3.5 h-3.5 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
        </svg>
      ) : (
        icon
      )}
      <span>{label}</span>
    </button>
  );

  if (!isOpen) return null;

  // Get visible steps for the step indicator (skip intermediate loading phases)
  const visibleSteps = WIZARD_STEPS.filter(s => VISIBLE_STEP_PHASES.includes(s.phase));
  const currentVisibleIndex = VISIBLE_STEP_PHASES.indexOf(currentPhase);
  // For intermediate phases, highlight the previous step
  const getEffectiveIndex = () => {
    if (currentVisibleIndex !== -1) return currentVisibleIndex;
    if (currentPhase === "planning") return VISIBLE_STEP_PHASES.indexOf("location");
    if (currentPhase === "specs-generating") return VISIBLE_STEP_PHASES.indexOf("specs");
    if (currentPhase === "designing") return VISIBLE_STEP_PHASES.indexOf("design");
    return 0;
  };
  const effectiveVisibleIndex = getEffectiveIndex();

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-3xl overflow-hidden">
        {/* Progress bar */}
        <div className="h-1 bg-background-secondary">
          <div
            className="h-full bg-gradient-to-r from-accent via-purple-500 to-pink-500 transition-all duration-500"
            style={{ width: `${progressPercent}%` }}
          />
        </div>

        {/* Step indicators */}
        <div className="px-8 pt-6 pb-4">
          <div className="flex items-center justify-between">
            {visibleSteps.map((step, index) => {
              const isActive = index === effectiveVisibleIndex;
              const isComplete = index < effectiveVisibleIndex;

              return (
                <div key={step.phase} className="flex items-center">
                  <div className="flex flex-col items-center">
                    <div
                      className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-all ${
                        isComplete
                          ? "bg-accent text-white"
                          : isActive
                          ? "bg-accent/20 text-accent border-2 border-accent"
                          : "bg-background-secondary text-muted"
                      }`}
                    >
                      {isComplete ? (
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                      ) : (
                        index + 1
                      )}
                    </div>
                    <span
                      className={`text-xs mt-1.5 ${
                        isActive ? "text-foreground font-medium" : "text-muted"
                      }`}
                    >
                      {step.title}
                    </span>
                  </div>
                  {index < visibleSteps.length - 1 && (
                    <div
                      className={`w-8 h-0.5 mx-1 ${
                        isComplete ? "bg-accent" : "bg-background-secondary"
                      }`}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Content */}
        <div className="px-8 py-6 min-h-[420px] max-h-[560px] overflow-y-auto">
          {/* Idea Phase */}
          {currentPhase === "idea" && (
            <div className="space-y-6">
              <div className="text-center mb-8">
                <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-accent/20 to-purple-500/20 flex items-center justify-center">
                  <svg className="w-8 h-8 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                  </svg>
                </div>
                <h2 className="text-xl font-semibold text-foreground">What do you want to build?</h2>
                <p className="text-sm text-muted mt-1">Give your project a name and summary</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-secondary mb-2">Project Name</label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="My Awesome App"
                  className="w-full px-4 py-3 rounded-xl bg-background border border-border text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent transition-all"
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-secondary mb-2">Summary</label>
                <textarea
                  value={summary}
                  onChange={(e) => setSummary(e.target.value)}
                  placeholder="A brief one-line summary of what you want to build..."
                  rows={2}
                  className="w-full px-4 py-3 rounded-xl bg-background border border-border text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent transition-all resize-none"
                />
                <p className="text-xs text-muted mt-1">AI will generate a detailed description from this</p>
              </div>
            </div>
          )}

          {/* Idea Review Phase */}
          {currentPhase === "idea-review" && (
            <div className="space-y-6">
              <div className="text-center mb-6">
                <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-purple-500/20 to-pink-500/20 flex items-center justify-center">
                  <svg className="w-8 h-8 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
                  </svg>
                </div>
                <h2 className="text-xl font-semibold text-foreground">{title}</h2>
                {summary && <p className="text-sm text-secondary mt-1">{summary}</p>}
                <p className="text-xs text-muted mt-1">Review and refine your generated idea</p>
              </div>

              {/* AI Action Buttons */}
              <div className="flex items-center justify-center gap-2 mb-4">
                <AIButton
                  onClick={async () => {
                    const result = await generateDescription('generate', title, summary, description, selectedIdeaAgent);
                    if (result) setDescription(result);
                  }}
                  disabled={!title.trim() || isGenerating}
                  isActive={isGenerating && generationType === 'generate'}
                  title="Regenerate description from title and summary"
                  label="Regenerate"
                  icon={
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                  }
                />
                <AIButton
                  onClick={async () => {
                    const result = await generateDescription('shorten', title, summary, description, selectedIdeaAgent);
                    if (result) setDescription(result);
                  }}
                  disabled={!description.trim() || isGenerating}
                  isActive={isGenerating && generationType === 'shorten'}
                  title="Make description more concise"
                  label="Shorten"
                  icon={
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 12H4" />
                    </svg>
                  }
                />
                <AIButton
                  onClick={async () => {
                    const result = await generateDescription('lengthen', title, summary, description, selectedIdeaAgent);
                    if (result) setDescription(result);
                  }}
                  disabled={!description.trim() || isGenerating}
                  isActive={isGenerating && generationType === 'lengthen'}
                  title="Expand description with more detail"
                  label="Lengthen"
                  icon={
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 8h16M4 16h16" />
                    </svg>
                  }
                />
                <AIButton
                  onClick={async () => {
                    const result = await generateDescription('simplify', title, summary, description, selectedIdeaAgent);
                    if (result) setDescription(result);
                  }}
                  disabled={!description.trim() || isGenerating}
                  isActive={isGenerating && generationType === 'simplify'}
                  title="Make description easier to understand"
                  label="Simplify"
                  icon={
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
                    </svg>
                  }
                />
                <button
                  onClick={() => setIsEditingIdea(!isEditingIdea)}
                  className={`flex items-center gap-1.5 px-2 py-1 rounded-md text-xs transition-all ${
                    isEditingIdea
                      ? "bg-accent/20 text-accent border border-accent/30"
                      : "text-muted hover:text-foreground hover:bg-card border border-transparent hover:border-border"
                  }`}
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                  <span>{isEditingIdea ? "Preview" : "Edit"}</span>
                </button>
                {description && (
                  <button
                    type="button"
                    onClick={() => setShowIdeaModal(true)}
                    className="flex items-center gap-1.5 px-2 py-1 rounded-md text-xs text-muted hover:text-foreground hover:bg-card border border-transparent hover:border-border transition-all"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                    </svg>
                    <span>View</span>
                  </button>
                )}
              </div>

              {/* Content area */}
              <div className="rounded-xl bg-background border border-border overflow-hidden">
                {isEditingIdea ? (
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Describe your idea in detail..."
                    disabled={isGenerating}
                    className="w-full h-64 px-4 py-3 bg-transparent text-foreground placeholder:text-muted focus:outline-none resize-none disabled:opacity-50 font-mono text-sm"
                  />
                ) : (
                  <div className="p-4 max-h-64 overflow-y-auto">
                    {description ? (
                      <div className="prose prose-sm prose-invert max-w-none">
                        <Markdown remarkPlugins={[remarkGfm]}>{description}</Markdown>
                      </div>
                    ) : (
                      <p className="text-muted text-sm italic">
                        No description yet. Click "Regenerate" to generate one from your title.
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Location Phase */}
          {currentPhase === "location" && (
            <div className="space-y-6">
              <div className="text-center mb-8">
                <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-blue-500/20 to-cyan-500/20 flex items-center justify-center">
                  <svg className="w-8 h-8 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                  </svg>
                </div>
                <h2 className="text-xl font-semibold text-foreground">Where should we create it?</h2>
                <p className="text-sm text-muted mt-1">Choose a directory for your new project</p>
              </div>

              <div className="p-6 rounded-xl bg-background border border-border">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <p className="text-sm font-medium text-foreground">{title}</p>
                    <p className="text-xs text-muted mt-0.5 line-clamp-2">{description || "No description"}</p>
                  </div>
                  <button
                    onClick={() => setCurrentPhase("idea-review")}
                    className="text-xs text-accent hover:underline"
                  >
                    Edit
                  </button>
                </div>

                <button
                  onClick={handleDirectoryPick}
                  className="w-full p-4 rounded-lg border-2 border-dashed border-border hover:border-accent/50 hover:bg-accent/5 transition-all text-left group"
                >
                  {selectedDirectory ? (
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center">
                        <svg className="w-5 h-5 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 13l4 4L19 7" />
                        </svg>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{selectedDirectory}</p>
                        <p className="text-xs text-muted">Click to change</p>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-background-secondary group-hover:bg-accent/10 flex items-center justify-center transition-colors">
                        <svg className="w-5 h-5 text-muted group-hover:text-accent transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4v16m8-8H4" />
                        </svg>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-foreground">Choose Directory</p>
                        <p className="text-xs text-muted">Select where to create your project</p>
                      </div>
                    </div>
                  )}
                </button>

                {selectedDirectory && (
                  <p className="text-xs text-muted mt-3 text-center">
                    Project will be created at: <span className="text-secondary">{selectedDirectory}/{title.trim().replace(/\s+/g, '-').toLowerCase()}</span>
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Planning Phase */}
          {currentPhase === "planning" && (
            <div className="flex flex-col items-center justify-center h-full py-8">
              <div className="relative w-24 h-24 mb-8">
                <svg
                  className="w-24 h-24 -rotate-90"
                  viewBox="0 0 100 100"
                >
                  <circle
                    cx="50"
                    cy="50"
                    r="46"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="8"
                    className="text-accent/20"
                  />
                  <circle
                    cx="50"
                    cy="50"
                    r="46"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="8"
                    strokeDasharray={`${planningProgress * 2.89} 289`}
                    strokeLinecap="round"
                    className="text-accent transition-all duration-500"
                  />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-2xl font-bold text-foreground">{Math.round(planningProgress)}%</span>
                </div>
              </div>

              <div className="text-center">
                <h2 className="text-xl font-semibold text-foreground mb-2">Creating Your Plan</h2>
                <p className="text-sm text-muted flex items-center justify-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
                  {planningMessage}
                </p>
              </div>

              <div className="mt-8 p-4 rounded-xl bg-background/50 border border-border/50 max-w-sm">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-500/20 to-pink-500/20 flex items-center justify-center flex-shrink-0">
                    <svg className="w-4 h-4 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">AI is working</p>
                    <p className="text-xs text-muted mt-0.5">
                      Analyzing your idea and creating user stories with acceptance criteria
                    </p>
                  </div>
                </div>
              </div>

              {/* Collapsible Log Viewer */}
              <div className="mt-4 w-full max-w-md flex flex-col items-center">
                <button
                  type="button"
                  onClick={() => setShowLogs(!showLogs)}
                  className="flex items-center gap-2 text-xs text-muted hover:text-foreground transition-colors"
                >
                  <svg 
                    className={`w-3 h-3 transition-transform ${showLogs ? "rotate-90" : ""}`} 
                    fill="none" 
                    stroke="currentColor" 
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                  {showLogs ? "Hide" : "Show"} Logs ({logs.length})
                </button>
                
                {showLogs && (
                  <div className="mt-2 rounded-lg bg-background border border-border overflow-hidden">
                    <div className="max-h-32 overflow-y-auto p-2 font-mono text-xs">
                      {logs.length === 0 ? (
                        <p className="text-muted italic">No logs yet...</p>
                      ) : (
                        logs.map((log) => (
                          <div 
                            key={log.id} 
                            className={`py-0.5 ${
                              log.type === "stderr" ? "text-destructive" : 
                              log.type === "system" ? "text-accent" : 
                              "text-secondary"
                            }`}
                          >
                            {log.content}
                          </div>
                        ))
                      )}
                      <div ref={logsEndRef} />
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Review Phase */}
          {currentPhase === "review" && (
            <div className="space-y-6">
              <div className="text-center mb-6">
                <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-green-500/20 to-emerald-500/20 flex items-center justify-center">
                  <svg className="w-8 h-8 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <h2 className="text-xl font-semibold text-foreground">Your Plan is Ready!</h2>
                <p className="text-sm text-muted mt-1">Here's what we've planned for {title}</p>
              </div>

              <div className="grid grid-cols-3 gap-4 mb-6">
                <div className="p-4 rounded-xl bg-background border border-border text-center">
                  <p className="text-2xl font-bold text-accent">{stories.length}</p>
                  <p className="text-xs text-muted">User Stories</p>
                </div>
                <div className="p-4 rounded-xl bg-background border border-border text-center">
                  <p className="text-2xl font-bold text-foreground">
                    {stories.reduce((acc, s) => acc + (s.acceptanceCriteria?.length || 0), 0)}
                  </p>
                  <p className="text-xs text-muted">Criteria</p>
                </div>
                <div className="p-4 rounded-xl bg-background border border-border text-center">
                  <p className="text-2xl font-bold text-foreground">
                    {stories.filter((s) => s.priority <= 3).length}
                  </p>
                  <p className="text-xs text-muted">High Priority</p>
                </div>
              </div>

              <div className={`${showAllStories ? "max-h-[300px]" : "max-h-[180px]"} overflow-y-auto space-y-2 pr-2 scrollbar-auto-hide transition-all duration-300`}>
                {(showAllStories ? stories : stories.slice(0, 8)).map((story) => (
                  <div
                    key={story.id}
                    className="p-3 rounded-lg bg-background border border-border flex items-start gap-3"
                  >
                    <span className="text-xs font-mono text-accent bg-accent/10 px-1.5 py-0.5 rounded">
                      {story.id}
                    </span>
                    <p className="text-sm text-foreground flex-1 line-clamp-1">{story.title}</p>
                  </div>
                ))}
                {stories.length > 8 && !showAllStories && (
                  <button
                    type="button"
                    onClick={() => setShowAllStories(true)}
                    className="w-full text-xs text-accent hover:text-accent/80 text-center py-2 hover:underline transition-colors"
                  >
                    + {stories.length - 8} more stories
                  </button>
                )}
                {stories.length > 8 && showAllStories && (
                  <button
                    type="button"
                    onClick={() => setShowAllStories(false)}
                    className="w-full text-xs text-muted hover:text-foreground text-center py-2 hover:underline transition-colors"
                  >
                    Show less
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Specs Phase */}
          {currentPhase === "specs" && (
            <div className="space-y-6">
              <div className="text-center mb-6">
                <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-indigo-500/20 to-violet-500/20 flex items-center justify-center">
                  <svg className="w-8 h-8 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
                  </svg>
                </div>
                <h2 className="text-xl font-semibold text-foreground">Generate Specifications</h2>
                <p className="text-sm text-muted mt-1">Create architecture and technical specifications for your project</p>
              </div>

              <div className="p-6 rounded-xl bg-background border border-border">
                <label className="block text-sm font-medium text-secondary mb-3">Specifications Agent</label>
                <div className="space-y-2">
                  {SPECS_AGENTS.map((agent) => (
                    <button
                      key={agent.id}
                      onClick={() => setSelectedSpecsAgent(agent.id)}
                      className={`w-full p-3 rounded-lg border transition-all text-left flex items-center gap-3 ${
                        selectedSpecsAgent === agent.id
                          ? "border-accent bg-accent/5"
                          : "border-border hover:border-border/80 hover:bg-background-secondary"
                      }`}
                    >
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                        selectedSpecsAgent === agent.id ? "bg-accent/20" : "bg-background-secondary"
                      }`}>
                        {selectedSpecsAgent === agent.id ? (
                          <svg className="w-4 h-4 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                        ) : (
                          <svg className="w-4 h-4 text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                          </svg>
                        )}
                      </div>
                      <div>
                        <p className={`text-sm font-medium ${selectedSpecsAgent === agent.id ? "text-foreground" : "text-secondary"}`}>
                          {agent.name}
                          {agent.preferred && (
                            <span className="ml-2 text-xs text-accent">(Recommended)</span>
                          )}
                        </p>
                        <p className="text-xs text-muted">{agent.command} {agent.args[0]}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              <p className="text-xs text-muted text-center">
                This will create a design.json with architecture, tech stack, and API specifications
              </p>
            </div>
          )}

          {/* Specs Generating Phase */}
          {currentPhase === "specs-generating" && (
            <div className="flex flex-col items-center justify-center h-full py-8">
              <div className="relative w-24 h-24 mb-8">
                <svg
                  className="w-24 h-24 -rotate-90"
                  viewBox="0 0 100 100"
                >
                  <circle
                    cx="50"
                    cy="50"
                    r="46"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="8"
                    className="text-indigo-500/20"
                  />
                  <circle
                    cx="50"
                    cy="50"
                    r="46"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="8"
                    strokeDasharray={`${specsProgress * 2.89} 289`}
                    strokeLinecap="round"
                    className="text-indigo-500 transition-all duration-500"
                  />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-2xl font-bold text-foreground">{Math.round(specsProgress)}%</span>
                </div>
              </div>

              <div className="text-center">
                <h2 className="text-xl font-semibold text-foreground mb-2">Creating Specifications</h2>
                <p className="text-sm text-muted flex items-center justify-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse" />
                  {specsMessage}
                </p>
              </div>

              <div className="mt-8 p-4 rounded-xl bg-background/50 border border-border/50 max-w-sm">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500/20 to-violet-500/20 flex items-center justify-center flex-shrink-0">
                    <svg className="w-4 h-4 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">Designing architecture</p>
                    <p className="text-xs text-muted mt-0.5">
                      Creating technical specifications and component structure
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Specs Preview Phase */}
          {currentPhase === "specs-preview" && designDocument && (
            <div className="space-y-6">
              <div className="text-center mb-6">
                <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-indigo-500/20 to-violet-500/20 flex items-center justify-center">
                  <svg className="w-8 h-8 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <h2 className="text-xl font-semibold text-foreground">Specifications Complete!</h2>
                <p className="text-sm text-muted mt-1">Technical specifications for {title}</p>
              </div>

              {/* Architecture Overview */}
              <div className="p-4 rounded-xl bg-background border border-border">
                <h3 className="text-sm font-medium text-foreground mb-2">Architecture</h3>
                <p className="text-xs text-muted line-clamp-3">{designDocument.architecture?.overview}</p>
              </div>

              {/* Tech Stack */}
              {designDocument.techStack && (
                <div className="grid grid-cols-2 gap-3">
                  {Object.entries(designDocument.techStack).map(([category, technologies]) => (
                    technologies && technologies.length > 0 && (
                      <div key={category} className="p-3 rounded-lg bg-background border border-border">
                        <p className="text-xs font-medium text-secondary capitalize mb-1">{category}</p>
                        <p className="text-xs text-foreground">{technologies.join(", ")}</p>
                      </div>
                    )
                  ))}
                </div>
              )}

              {/* Components */}
              {designDocument.architecture?.components && (
                <div className="max-h-[120px] overflow-y-auto space-y-2 scrollbar-auto-hide">
                  {designDocument.architecture.components.slice(0, 5).map((component, index) => (
                    <div key={index} className="p-2 rounded-lg bg-background border border-border">
                      <p className="text-xs font-medium text-foreground">{component.name}</p>
                      <p className="text-xs text-muted line-clamp-1">{component.description}</p>
                    </div>
                  ))}
                  {designDocument.architecture.components.length > 5 && (
                    <p className="text-xs text-muted text-center py-1">
                      + {designDocument.architecture.components.length - 5} more components
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Visual Design Phase */}
          {currentPhase === "design" && (
            <div className="space-y-6">
              <div className="text-center mb-6">
                <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-pink-500/20 to-rose-500/20 flex items-center justify-center">
                  <svg className="w-8 h-8 text-pink-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                </div>
                <h2 className="text-xl font-semibold text-foreground">Visual Design Style</h2>
                <p className="text-sm text-muted mt-1">Choose a visual style for your project</p>
              </div>

              <div className="p-6 rounded-xl bg-background border border-border">
                <div className="space-y-2">
                  {DESIGN_OPTIONS.map((option) => (
                    <button
                      key={option.id}
                      onClick={() => setSelectedDesignOption(option.id)}
                      className={`w-full p-3 rounded-lg border transition-all text-left flex items-center gap-3 ${
                        selectedDesignOption === option.id
                          ? "border-pink-500 bg-pink-500/5"
                          : "border-border hover:border-border/80 hover:bg-background-secondary"
                      }`}
                    >
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                        selectedDesignOption === option.id ? "bg-pink-500/20" : "bg-background-secondary"
                      }`}>
                        {selectedDesignOption === option.id ? (
                          <svg className="w-4 h-4 text-pink-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                        ) : (
                          <svg className="w-4 h-4 text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                          </svg>
                        )}
                      </div>
                      <div>
                        <p className={`text-sm font-medium ${selectedDesignOption === option.id ? "text-foreground" : "text-secondary"}`}>
                          {option.name}
                        </p>
                        <p className="text-xs text-muted">{option.description}</p>
                      </div>
                    </button>
                  ))}
                </div>

                {selectedDesignOption === "custom" && (
                  <div className="mt-4">
                    <textarea
                      value={customDesignPrompt}
                      onChange={(e) => setCustomDesignPrompt(e.target.value)}
                      placeholder="Describe your preferred visual style, colors, fonts, and overall aesthetic..."
                      rows={3}
                      className="w-full px-4 py-3 rounded-xl bg-background-secondary border border-border text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-pink-500/50 focus:border-pink-500 transition-all resize-none text-sm"
                    />
                  </div>
                )}
              </div>

              <p className="text-xs text-muted text-center">
                Visual design preferences will be applied during the build phase
              </p>
            </div>
          )}

          {/* Designing Phase (Visual Design Generation) */}
          {currentPhase === "designing" && (
            <div className="flex flex-col items-center justify-center h-full py-8">
              <div className="relative w-24 h-24 mb-8">
                <svg
                  className="w-24 h-24 -rotate-90"
                  viewBox="0 0 100 100"
                >
                  <circle
                    cx="50"
                    cy="50"
                    r="46"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="8"
                    className="text-pink-500/20"
                  />
                  <circle
                    cx="50"
                    cy="50"
                    r="46"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="8"
                    strokeDasharray={`${designProgress * 2.89} 289`}
                    strokeLinecap="round"
                    className="text-pink-500 transition-all duration-500"
                  />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-2xl font-bold text-foreground">{Math.round(designProgress)}%</span>
                </div>
              </div>

              <div className="text-center">
                <h2 className="text-xl font-semibold text-foreground mb-2">Creating Your Design</h2>
                <p className="text-sm text-muted flex items-center justify-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-pink-500 animate-pulse" />
                  {designMessage}
                </p>
              </div>

              <div className="mt-8 p-4 rounded-xl bg-background/50 border border-border/50 max-w-sm">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-pink-500/20 to-rose-500/20 flex items-center justify-center flex-shrink-0">
                    <svg className="w-4 h-4 text-pink-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">Generating visual design</p>
                    <p className="text-xs text-muted mt-0.5">
                      Creating design files in design/ folder
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Design Preview Phase */}
          {currentPhase === "design-preview" && (
            <div className="space-y-6">
              <div className="text-center mb-6">
                <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-pink-500/20 to-rose-500/20 flex items-center justify-center">
                  <svg className="w-8 h-8 text-pink-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <h2 className="text-xl font-semibold text-foreground">Design Complete!</h2>
                <p className="text-sm text-muted mt-1">Visual design created for {title}</p>
              </div>

              <div className="p-4 rounded-xl bg-background border border-border">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-lg bg-pink-500/10 flex items-center justify-center">
                    <svg className="w-5 h-5 text-pink-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">design/</p>
                    <p className="text-xs text-muted">Visual prototype files</p>
                  </div>
                </div>
                
                <div className="space-y-2">
                  {generatedDesignFiles.length > 0 ? (
                    generatedDesignFiles.map((file) => (
                      <div key={file} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-background-secondary">
                        <svg className="w-4 h-4 text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                        <span className="text-sm text-secondary">{file}</span>
                      </div>
                    ))
                  ) : (
                    <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-background-secondary">
                      <svg className="w-4 h-4 text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      <span className="text-sm text-secondary">index.html</span>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex justify-center gap-3 mt-4">
                <button
                  onClick={handleOpenDesignPreview}
                  className="px-4 py-2 text-sm bg-background border border-border rounded-lg text-foreground hover:bg-card transition-colors flex items-center gap-2"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                  Preview Design
                </button>
              </div>
              
              <p className="text-xs text-muted text-center">
                You can refine the design during the build phase.
              </p>
            </div>
          )}

          {/* Ready Phase */}
          {currentPhase === "ready" && (
            <div className="flex flex-col items-center justify-center h-full py-8">
              <div className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-gradient-to-br from-accent/20 to-green-500/20 flex items-center justify-center">
                <svg className="w-10 h-10 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
                </svg>
              </div>
              <h2 className="text-2xl font-semibold text-foreground mb-2">Ready to Build!</h2>
              <p className="text-sm text-muted text-center max-w-sm">
                Your project is set up with {stories.length} user stories and a technical design. Press the play button to start building with AI.
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-8 py-4 border-t border-border bg-background-secondary flex justify-between items-center">
          <div>
            {(currentPhase === "idea-review" || currentPhase === "location" || currentPhase === "specs" || currentPhase === "specs-preview" || currentPhase === "design" || currentPhase === "design-preview") && (
              <button
                onClick={handleBack}
                className="px-4 py-2 text-sm text-secondary hover:text-foreground transition-colors"
              >
                Back
              </button>
            )}
          </div>

          <div className="flex items-center gap-3">
            {currentPhase !== "planning" && currentPhase !== "specs-generating" && currentPhase !== "designing" && currentPhase !== "ready" && (
              <button
                onClick={onClose}
                disabled={isGenerating || isGeneratingSpecs || isGeneratingDesign}
                className="px-4 py-2 text-sm text-secondary hover:text-foreground transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
            )}

            {currentPhase === "idea" && (
              <>
                {/* Agent selector dropdown */}
                <div className="relative" ref={ideaAgentDropdownRef}>
                  <button
                    onClick={() => setShowIdeaAgentDropdown(!showIdeaAgentDropdown)}
                    disabled={isGenerating}
                    className="px-3 py-2.5 text-sm bg-background-secondary border border-border rounded-lg font-medium hover:bg-background transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    <svg className="w-4 h-4 text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                    <span className="text-foreground">{IDEA_AGENTS.find(a => a.id === selectedIdeaAgent)?.name || "Amp"}</span>
                    <svg className="w-3 h-3 text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                  
                  {showIdeaAgentDropdown && (
                    <div className="absolute bottom-full mb-2 right-0 w-48 bg-card border border-border rounded-lg shadow-xl overflow-hidden z-10">
                      {IDEA_AGENTS.map((agent) => (
                        <button
                          key={agent.id}
                          onClick={() => {
                            setSelectedIdeaAgent(agent.id);
                            setShowIdeaAgentDropdown(false);
                          }}
                          className={`w-full px-3 py-2 text-left text-sm flex items-center gap-2 hover:bg-background-secondary transition-colors ${
                            selectedIdeaAgent === agent.id ? "bg-accent/10 text-accent" : "text-foreground"
                          }`}
                        >
                          {selectedIdeaAgent === agent.id && (
                            <svg className="w-3.5 h-3.5 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                          )}
                          <span className={selectedIdeaAgent === agent.id ? "" : "ml-5.5"}>{agent.name}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <button
                  onClick={handleNext}
                  disabled={!title.trim() || isGenerating}
                  className="px-6 py-2.5 text-sm bg-accent text-white rounded-lg font-medium hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {isGenerating ? (
                    <>
                      <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      Generating...
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
                      </svg>
                      Generate Idea
                    </>
                  )}
                </button>
              </>
            )}

            {currentPhase === "idea-review" && (
              <button
                onClick={handleNext}
                disabled={!description.trim() || isGenerating}
                className="px-6 py-2.5 text-sm bg-accent text-white rounded-lg font-medium hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Continue
              </button>
            )}

            {currentPhase === "location" && (
              <>
                {/* Plan Agent Selector */}
                <div className="relative" ref={planAgentDropdownRef}>
                  <button
                    type="button"
                    onClick={() => setShowPlanAgentDropdown(!showPlanAgentDropdown)}
                    disabled={isCreatingProject}
                    className="flex items-center gap-1.5 px-3 py-2.5 text-sm text-secondary hover:text-foreground bg-background border border-border rounded-lg hover:border-accent/50 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    title="Select AI agent for planning"
                  >
                    <span>{PLAN_AGENTS.find(a => a.id === selectedPlanAgent)?.name || "Amp"}</span>
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                  
                  {showPlanAgentDropdown && (
                    <div className="absolute bottom-full mb-2 right-0 w-48 bg-card border border-border rounded-lg shadow-xl overflow-hidden z-10">
                      {PLAN_AGENTS.map((agent) => (
                        <button
                          key={agent.id}
                          onClick={() => {
                            setSelectedPlanAgent(agent.id);
                            setShowPlanAgentDropdown(false);
                          }}
                          className={`w-full px-3 py-2 text-left text-sm flex items-center gap-2 hover:bg-background-secondary transition-colors ${
                            selectedPlanAgent === agent.id ? "bg-accent/10 text-accent" : "text-foreground"
                          }`}
                        >
                          {selectedPlanAgent === agent.id && (
                            <svg className="w-3.5 h-3.5 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                          )}
                          <span className={selectedPlanAgent === agent.id ? "" : "ml-5.5"}>{agent.name}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <button
                  onClick={handleNext}
                  disabled={!selectedDirectory || !isValidPath || isCreatingProject}
                  className="px-6 py-2.5 text-sm bg-gradient-to-r from-accent to-purple-500 text-white rounded-lg font-medium hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {isCreatingProject ? (
                    <>
                      <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      Creating...
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
                      </svg>
                      Generate Plan
                    </>
                  )}
                </button>
              </>
            )}

            {currentPhase === "review" && (
              <button
                onClick={handleNext}
                className="px-6 py-2.5 text-sm bg-accent text-white rounded-lg font-medium hover:opacity-90 transition-opacity"
              >
                Continue to Specs
              </button>
            )}

            {currentPhase === "specs" && (
              <button
                onClick={handleNext}
                className="px-6 py-2.5 text-sm bg-gradient-to-r from-indigo-500 to-violet-500 text-white rounded-lg font-medium hover:opacity-90 transition-opacity flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
                </svg>
                Generate Specs
              </button>
            )}

            {currentPhase === "specs-preview" && (
              <button
                onClick={handleNext}
                className="px-6 py-2.5 text-sm bg-accent text-white rounded-lg font-medium hover:opacity-90 transition-opacity"
              >
                Continue to Design
              </button>
            )}

            {currentPhase === "design" && (
              <button
                onClick={handleNext}
                disabled={isGeneratingDesign}
                className="px-6 py-2.5 text-sm bg-gradient-to-r from-pink-500 to-rose-500 text-white rounded-lg font-medium hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                {selectedDesignOption === "skip" ? "Skip & Finish" : "Generate Design"}
              </button>
            )}

            {currentPhase === "design-preview" && (
              <div className="flex items-center gap-2">
                <button
                  onClick={handleRegenerateDesign}
                  className="px-4 py-2.5 text-sm border border-border rounded-lg text-secondary hover:text-foreground hover:bg-card transition-colors flex items-center gap-2"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  Regenerate
                </button>
                <button
                  onClick={handleNext}
                  className="px-6 py-2.5 text-sm bg-accent text-white rounded-lg font-medium hover:opacity-90 transition-opacity"
                >
                  Looks Good!
                </button>
              </div>
            )}

            {currentPhase === "ready" && (
              <button
                onClick={handleFinish}
                className="px-6 py-2.5 text-sm bg-gradient-to-r from-accent to-green-500 text-white rounded-lg font-medium hover:opacity-90 transition-opacity flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                </svg>
                Open Project
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Full Description Modal */}
      {showIdeaModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[60]">
          <div className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-4xl max-h-[80vh] overflow-hidden flex flex-col">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-border flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-foreground">{title}</h3>
                {summary && <p className="text-sm text-secondary mt-0.5">{summary}</p>}
              </div>
              <button
                onClick={() => setShowIdeaModal(false)}
                className="p-2 text-muted hover:text-foreground hover:bg-background-secondary rounded-lg transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Modal Content */}
            <div className="flex-1 overflow-y-auto p-6">
              <div className="prose prose-sm prose-invert max-w-none">
                <Markdown remarkPlugins={[remarkGfm]}>{description}</Markdown>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 border-t border-border flex justify-end gap-3">
              <button
                onClick={async () => {
                  try {
                    const doc = new jsPDF({
                      orientation: "portrait",
                      unit: "mm",
                      format: "a4",
                    });

                    const pageWidth = doc.internal.pageSize.getWidth();
                    const margin = 20;
                    const contentWidth = pageWidth - margin * 2;
                    let y = margin;

                    doc.setFontSize(20);
                    doc.setFont("helvetica", "bold");
                    doc.text(title, margin, y);
                    y += 10;

                    if (summary) {
                      doc.setFontSize(12);
                      doc.setFont("helvetica", "italic");
                      doc.setTextColor(100, 100, 100);
                      const summaryLines = doc.splitTextToSize(summary, contentWidth);
                      doc.text(summaryLines, margin, y);
                      y += summaryLines.length * 5 + 5;
                    }

                    doc.setFontSize(11);
                    doc.setFont("helvetica", "normal");
                    doc.setTextColor(50, 50, 50);
                    const descLines = doc.splitTextToSize(description, contentWidth);
                    doc.text(descLines, margin, y);

                    const filePath = await save({
                      defaultPath: `${title.replace(/[^a-zA-Z0-9]/g, "_")}_idea.pdf`,
                      filters: [{ name: "PDF", extensions: ["pdf"] }],
                    });

                    if (filePath) {
                      const pdfBlob = doc.output("blob");
                      const arrayBuffer = await pdfBlob.arrayBuffer();
                      await invoke("write_binary_file", {
                        path: filePath,
                        data: Array.from(new Uint8Array(arrayBuffer)),
                      });
                    }
                  } catch (err) {
                    console.error("Failed to export PDF:", err);
                  }
                }}
                className="px-4 py-2 text-sm bg-background border border-border text-foreground rounded-lg font-medium hover:bg-card transition-colors flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                Save PDF
              </button>
              <button
                onClick={() => setShowIdeaModal(false)}
                className="px-4 py-2 text-sm bg-accent text-white rounded-lg font-medium hover:opacity-90 transition-opacity"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Design Preview Modal */}
      {showDesignPreviewModal && designPreviewUrl && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[60]">
          <div className="bg-card border border-border rounded-2xl shadow-2xl w-[90vw] h-[85vh] max-w-6xl overflow-hidden flex flex-col">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-border flex items-center justify-between flex-shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-pink-500/10 flex items-center justify-center">
                  <svg className="w-5 h-5 text-pink-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-foreground">Design Preview</h3>
                  <p className="text-xs text-muted">design/index.html</p>
                </div>
              </div>
              <button
                onClick={handleCloseDesignPreview}
                className="p-2 text-muted hover:text-foreground hover:bg-background-secondary rounded-lg transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Modal Content - Iframe with live server */}
            <div className="flex-1 bg-white overflow-hidden">
              <iframe
                src={designPreviewUrl}
                className="w-full h-full border-0"
                title="Design Preview"
              />
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 border-t border-border flex justify-end gap-3 flex-shrink-0">
              <button
                onClick={handleCloseDesignPreview}
                className="px-4 py-2 text-sm bg-accent text-white rounded-lg font-medium hover:opacity-90 transition-opacity"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Error Modal */}
      {showErrorModal && error && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[70]">
          <div className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-destructive/20 bg-destructive/5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-destructive/20 flex items-center justify-center flex-shrink-0">
                  <svg className="w-5 h-5 text-destructive" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-foreground">{errorTitle}</h3>
                </div>
              </div>
            </div>

            {/* Modal Content */}
            <div className="p-6">
              <p className="text-sm text-secondary leading-relaxed whitespace-pre-wrap">{error}</p>
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 border-t border-border flex justify-end gap-3">
              <button
                onClick={dismissError}
                className="px-4 py-2 text-sm bg-accent text-white rounded-lg font-medium hover:opacity-90 transition-opacity"
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
