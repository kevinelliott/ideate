import { useCallback, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { usePrdStore, type PrdMetadata } from "../stores/prdStore";
import { useBuildStore } from "../stores/buildStore";
import { useCostStore } from "../stores/costStore";
import { usePromptStore } from "../stores/promptStore";
import { useProcessStore } from "../stores/processStore";
import { defaultPlugins, type AgentPlugin } from "../types";
import { useProjectStore } from "../stores/projectStore";

interface SpawnAgentResult {
  process_id: string;
}

interface WaitAgentResult {
  process_id: string;
  exit_code: number | null;
  success: boolean;
}

interface Prd {
  project?: string;
  branchName?: string;
  description?: string;
  userStories: Array<{
    id: string;
    title: string;
    description: string;
    acceptanceCriteria: string[];
    priority: number;
    passes: boolean;
    status?: string;
    notes: string;
  }>;
}

export function usePrdGeneration() {
  const setStatus = usePrdStore((state) => state.setStatus);
  const setPrd = usePrdStore((state) => state.setPrd);
  const appendLog = useBuildStore((state) => state.appendLog);
  const clearLogs = useBuildStore((state) => state.clearLogs);
  const setCurrentProcessId = useBuildStore(
    (state) => state.setCurrentProcessId,
  );
  const activeProjectId = useProjectStore((state) => state.activeProjectId);
  const parseAndAddFromOutput = useCostStore(
    (state) => state.parseAndAddFromOutput,
  );
  const getPrompt = usePromptStore((state) => state.getPrompt);

  const registerProcess = useProcessStore((state) => state.registerProcess);
  const unregisterProcess = useProcessStore((state) => state.unregisterProcess);

  const generatePrd = useCallback(
    async (
      idea: string,
      projectName: string,
      projectPath: string,
      agentId?: string,
    ): Promise<boolean> => {
      if (!activeProjectId) {
        console.error("No active project");
        return false;
      }

      setStatus("generating");
      clearLogs(activeProjectId);
      appendLog(
        activeProjectId,
        "system",
        `Starting PRD generation for "${projectName}"...`,
      );

      try {
        const selectedAgentId = agentId || "amp";
        const plugin =
          defaultPlugins.find((p: AgentPlugin) => p.id === selectedAgentId) ||
          defaultPlugins[0];

        if (!plugin) {
          throw new Error("No agent plugin configured");
        }

        appendLog(activeProjectId, "system", `Using agent: ${plugin.name}`);

        const prompt = getPrompt("prdGeneration", {
          "{{projectName}}": projectName,
          "{{idea}}": idea,
        });

        const args = plugin.argsTemplate.map((arg: string) =>
          arg.replace("{{prompt}}", prompt),
        );

        appendLog(activeProjectId, "system", `Spawning ${plugin.command}...`);

        const startTime = Date.now();

        const spawnResult = await invoke<SpawnAgentResult>("spawn_agent", {
          executable: plugin.command,
          args,
          workingDirectory: projectPath,
        });

        setCurrentProcessId(activeProjectId, spawnResult.process_id);
        appendLog(
          activeProjectId,
          "system",
          `Agent started (process ID: ${spawnResult.process_id})`,
        );

        registerProcess({
          processId: spawnResult.process_id,
          agentId: plugin.id,
          command: {
            executable: plugin.command,
            args,
            workingDirectory: projectPath,
          },
          projectId: activeProjectId,
          type: "prd",
          label: "PRD Generation",
        });

        const waitResult = await invoke<WaitAgentResult>("wait_agent", {
          processId: spawnResult.process_id,
        });

        const durationMs = Date.now() - startTime;

        unregisterProcess(spawnResult.process_id);
        setCurrentProcessId(activeProjectId, null);

        const logs = useBuildStore
          .getState()
          .getProjectState(activeProjectId).logs;
        const recentLogs = logs
          .slice(-50)
          .map((l) => l.content)
          .join("\n");
        parseAndAddFromOutput(
          activeProjectId,
          projectPath,
          selectedAgentId,
          "PRD Generation",
          recentLogs,
          durationMs,
        );

        if (!waitResult.success) {
          appendLog(
            activeProjectId,
            "system",
            `Agent exited with error (code: ${waitResult.exit_code ?? "unknown"})`,
          );
          setStatus("error");
          return false;
        }

        appendLog(
          activeProjectId,
          "system",
          "Agent completed successfully. Loading generated PRD...",
        );

        const prd = await invoke<Prd | null>("load_prd", {
          projectPath,
        });

        if (prd && prd.userStories && prd.userStories.length > 0) {
          const stories = prd.userStories.map((story) => ({
            id: story.id,
            title: story.title,
            description: story.description,
            acceptanceCriteria: story.acceptanceCriteria,
            priority: story.priority,
            passes: story.passes,
            notes: story.notes,
          }));
          const metadata: PrdMetadata = {
            project: prd.project,
            description: prd.description,
            branchName: prd.branchName,
          };
          setPrd(stories, metadata, activeProjectId);
          setStatus("ready");
          appendLog(
            activeProjectId,
            "system",
            `PRD loaded with ${stories.length} user stories`,
          );
          return true;
        } else {
          appendLog(
            activeProjectId,
            "system",
            "Warning: PRD file not found or empty after generation",
          );
          setStatus("error");
          return false;
        }
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        appendLog(activeProjectId, "system", `Error: ${errorMessage}`);
        setStatus("error");
        return false;
      }
    },
    [
      activeProjectId,
      setStatus,
      setPrd,
      appendLog,
      clearLogs,
      setCurrentProcessId,
      parseAndAddFromOutput,
      getPrompt,
      registerProcess,
      unregisterProcess,
    ],
  );

  const generatePrdFromCodebase = useCallback(
    async (
      projectId: string,
      projectName: string,
      projectPath: string,
      agentId?: string,
    ): Promise<boolean> => {
      setStatus("generating");
      clearLogs(projectId);
      appendLog(
        projectId,
        "system",
        `Analyzing existing codebase for "${projectName}"...`,
      );

      try {
        const selectedAgentId = agentId || "amp";
        const plugin =
          defaultPlugins.find((p: AgentPlugin) => p.id === selectedAgentId) ||
          defaultPlugins[0];

        if (!plugin) {
          throw new Error("No agent plugin configured");
        }

        appendLog(projectId, "system", `Using agent: ${plugin.name}`);

        const prompt = getPrompt("prdFromCodebase", {
          "{{projectName}}": projectName,
        });

        const args = plugin.argsTemplate.map((arg: string) =>
          arg.replace("{{prompt}}", prompt),
        );

        appendLog(
          projectId,
          "system",
          `Spawning ${plugin.command} to analyze codebase...`,
        );

        const startTime = Date.now();

        const spawnResult = await invoke<SpawnAgentResult>("spawn_agent", {
          executable: plugin.command,
          args,
          workingDirectory: projectPath,
        });

        setCurrentProcessId(projectId, spawnResult.process_id);
        appendLog(
          projectId,
          "system",
          `Agent started (process ID: ${spawnResult.process_id})`,
        );

        registerProcess({
          processId: spawnResult.process_id,
          agentId: plugin.id,
          command: {
            executable: plugin.command,
            args,
            workingDirectory: projectPath,
          },
          projectId,
          type: "prd",
          label: "Codebase Analysis",
        });

        const waitResult = await invoke<WaitAgentResult>("wait_agent", {
          processId: spawnResult.process_id,
        });

        const durationMs = Date.now() - startTime;

        unregisterProcess(spawnResult.process_id);
        setCurrentProcessId(projectId, null);

        const logs = useBuildStore.getState().getProjectState(projectId).logs;
        const recentLogs = logs
          .slice(-50)
          .map((l) => l.content)
          .join("\n");
        parseAndAddFromOutput(
          projectId,
          projectPath,
          selectedAgentId,
          "Codebase Analysis",
          recentLogs,
          durationMs,
        );

        if (!waitResult.success) {
          appendLog(
            projectId,
            "system",
            `Agent exited with error (code: ${waitResult.exit_code ?? "unknown"})`,
          );
          setStatus("error");
          return false;
        }

        appendLog(
          projectId,
          "system",
          "Codebase analysis completed. Loading generated PRD...",
        );

        const prd = await invoke<Prd | null>("load_prd", {
          projectPath,
        });

        if (prd && prd.userStories && prd.userStories.length > 0) {
          const stories = prd.userStories.map((story) => ({
            id: story.id,
            title: story.title,
            description: story.description,
            acceptanceCriteria: story.acceptanceCriteria,
            priority: story.priority,
            passes: story.passes,
            notes: story.notes,
          }));
          const metadata: PrdMetadata = {
            project: prd.project,
            description: prd.description,
            branchName: prd.branchName,
          };
          setPrd(stories, metadata, projectId);
          setStatus("ready");
          appendLog(
            projectId,
            "system",
            `PRD generated with ${stories.length} user stories from codebase analysis`,
          );
          return true;
        } else {
          appendLog(
            projectId,
            "system",
            "Warning: PRD file not found or empty after codebase analysis",
          );
          setStatus("error");
          return false;
        }
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        appendLog(projectId, "system", `Error: ${errorMessage}`);
        setStatus("error");
        return false;
      }
    },
    [
      setStatus,
      setPrd,
      appendLog,
      clearLogs,
      setCurrentProcessId,
      parseAndAddFromOutput,
      getPrompt,
      registerProcess,
      unregisterProcess,
    ],
  );

  const generateAdditionalStories = useCallback(
    async (
      projectId: string,
      projectName: string,
      projectPath: string,
      request: string,
      agentId?: string,
    ): Promise<boolean> => {
      const currentStories = usePrdStore.getState().stories;

      setStatus("generating");
      appendLog(projectId, "system", `Generating additional user stories...`);

      try {
        const selectedAgentId = agentId || "amp";
        const plugin =
          defaultPlugins.find((p: AgentPlugin) => p.id === selectedAgentId) ||
          defaultPlugins[0];

        if (!plugin) {
          throw new Error("No agent plugin configured");
        }

        appendLog(projectId, "system", `Using agent: ${plugin.name}`);

        const existingStoriesSummary = currentStories
          .map(
            (s) =>
              `- ${s.id}: ${s.title} (Priority: ${s.priority}, Status: ${s.passes ? "Complete" : "Pending"})`,
          )
          .join("\n");

        const nextPriority =
          currentStories.length > 0
            ? Math.max(...currentStories.map((s) => s.priority)) + 1
            : 1;

        const prompt = getPrompt("additionalStories", {
          "{{projectName}}": projectName,
          "{{existingStories}}":
            existingStoriesSummary || "No existing stories",
          "{{request}}": request,
          "{{nextPriority}}": String(nextPriority),
        });

        const args = plugin.argsTemplate.map((arg: string) =>
          arg.replace("{{prompt}}", prompt),
        );

        appendLog(
          projectId,
          "system",
          `Spawning ${plugin.command} to generate stories...`,
        );

        const startTime = Date.now();

        const spawnResult = await invoke<SpawnAgentResult>("spawn_agent", {
          executable: plugin.command,
          args,
          workingDirectory: projectPath,
        });

        setCurrentProcessId(projectId, spawnResult.process_id);
        appendLog(
          projectId,
          "system",
          `Agent started (process ID: ${spawnResult.process_id})`,
        );

        registerProcess({
          processId: spawnResult.process_id,
          agentId: plugin.id,
          command: {
            executable: plugin.command,
            args,
            workingDirectory: projectPath,
          },
          projectId,
          type: "prd",
          label: "Story Generation",
        });

        const waitResult = await invoke<WaitAgentResult>("wait_agent", {
          processId: spawnResult.process_id,
        });

        const durationMs = Date.now() - startTime;

        unregisterProcess(spawnResult.process_id);
        setCurrentProcessId(projectId, null);

        const logs = useBuildStore.getState().getProjectState(projectId).logs;
        const recentLogs = logs
          .slice(-50)
          .map((l) => l.content)
          .join("\n");
        parseAndAddFromOutput(
          projectId,
          projectPath,
          selectedAgentId,
          "Story Generation",
          recentLogs,
          durationMs,
        );

        if (!waitResult.success) {
          appendLog(
            projectId,
            "system",
            `Agent exited with error (code: ${waitResult.exit_code ?? "unknown"})`,
          );
          setStatus("ready");
          return false;
        }

        appendLog(
          projectId,
          "system",
          "Story generation completed. Loading updated PRD...",
        );

        const prd = await invoke<Prd | null>("load_prd", {
          projectPath,
        });

        if (prd && prd.userStories && prd.userStories.length > 0) {
          const stories = prd.userStories.map((story) => ({
            id: story.id,
            title: story.title,
            description: story.description,
            acceptanceCriteria: story.acceptanceCriteria,
            priority: story.priority,
            passes: story.passes,
            notes: story.notes,
          }));
          const metadata: PrdMetadata = {
            project: prd.project,
            description: prd.description,
            branchName: prd.branchName,
          };

          const newStoriesCount = stories.length - currentStories.length;
          setPrd(stories, metadata, projectId);
          setStatus("ready");
          appendLog(
            projectId,
            "system",
            `Added ${newStoriesCount} new user stories (total: ${stories.length})`,
          );
          return true;
        } else {
          appendLog(
            projectId,
            "system",
            "Warning: PRD file not found or empty after story generation",
          );
          setStatus("ready");
          return false;
        }
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        appendLog(projectId, "system", `Error: ${errorMessage}`);
        setStatus("ready");
        return false;
      }
    },
    [
      setStatus,
      setPrd,
      appendLog,
      setCurrentProcessId,
      parseAndAddFromOutput,
      getPrompt,
      registerProcess,
      unregisterProcess,
    ],
  );

  const breakdownStories = useCallback(
    async (
      projectId: string,
      projectName: string,
      projectPath: string,
      agentId?: string,
    ): Promise<boolean> => {
      const currentStories = usePrdStore.getState().stories;
      const initialCount = currentStories.length;

      appendLog(
        projectId,
        "system",
        `Breaking down ${initialCount} user stories into smaller iterations...`,
      );

      try {
        const selectedAgentId = agentId || "amp";
        const plugin =
          defaultPlugins.find((p: AgentPlugin) => p.id === selectedAgentId) ||
          defaultPlugins[0];

        if (!plugin) {
          throw new Error("No agent plugin configured");
        }

        appendLog(projectId, "system", `Using agent: ${plugin.name}`);

        const prompt = getPrompt("storyBreakdown", {
          "{{projectName}}": projectName,
        });

        const args = plugin.argsTemplate.map((arg: string) =>
          arg.replace("{{prompt}}", prompt),
        );

        appendLog(
          projectId,
          "system",
          `Spawning ${plugin.command} to analyze and break down stories...`,
        );

        const startTime = Date.now();

        const spawnResult = await invoke<SpawnAgentResult>("spawn_agent", {
          executable: plugin.command,
          args,
          workingDirectory: projectPath,
        });

        setCurrentProcessId(projectId, spawnResult.process_id);
        appendLog(
          projectId,
          "system",
          `Agent started (process ID: ${spawnResult.process_id})`,
        );

        registerProcess({
          processId: spawnResult.process_id,
          agentId: plugin.id,
          command: {
            executable: plugin.command,
            args,
            workingDirectory: projectPath,
          },
          projectId,
          type: "prd",
          label: "Story Breakdown",
        });

        const waitResult = await invoke<WaitAgentResult>("wait_agent", {
          processId: spawnResult.process_id,
        });

        const durationMs = Date.now() - startTime;

        unregisterProcess(spawnResult.process_id);
        setCurrentProcessId(projectId, null);

        const logs = useBuildStore.getState().getProjectState(projectId).logs;
        const recentLogs = logs
          .slice(-50)
          .map((l) => l.content)
          .join("\n");
        parseAndAddFromOutput(
          projectId,
          projectPath,
          selectedAgentId,
          "Story Breakdown",
          recentLogs,
          durationMs,
        );

        if (!waitResult.success) {
          appendLog(
            projectId,
            "system",
            `Agent exited with error (code: ${waitResult.exit_code ?? "unknown"})`,
          );
          setStatus("error");
          return false;
        }

        appendLog(
          projectId,
          "system",
          "Story breakdown completed. Loading refined PRD...",
        );

        const prd = await invoke<Prd | null>("load_prd", {
          projectPath,
        });

        if (prd && prd.userStories && prd.userStories.length > 0) {
          const stories = prd.userStories.map((story) => ({
            id: story.id,
            title: story.title,
            description: story.description,
            acceptanceCriteria: story.acceptanceCriteria,
            priority: story.priority,
            passes: story.passes,
            notes: story.notes,
          }));
          const metadata: PrdMetadata = {
            project: prd.project,
            description: prd.description,
            branchName: prd.branchName,
          };

          setPrd(stories, metadata, projectId);
          setStatus("ready");

          const delta = stories.length - initialCount;
          if (delta > 0) {
            appendLog(
              projectId,
              "system",
              `Story breakdown complete: ${initialCount} → ${stories.length} stories (+${delta} from breakdown)`,
            );
          } else {
            appendLog(
              projectId,
              "system",
              `Story breakdown complete: all ${stories.length} stories are already well-sized`,
            );
          }
          return true;
        } else {
          appendLog(
            projectId,
            "system",
            "Warning: PRD file not found or empty after story breakdown",
          );
          setStatus("error");
          return false;
        }
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        appendLog(projectId, "system", `Error: ${errorMessage}`);
        setStatus("error");
        return false;
      }
    },
    [
      setStatus,
      setPrd,
      appendLog,
      setCurrentProcessId,
      parseAndAddFromOutput,
      getPrompt,
      registerProcess,
      unregisterProcess,
    ],
  );

  const generatePrdFromIdea = useCallback(
    async (
      projectId: string,
      projectName: string,
      projectPath: string,
      ideaTitle: string,
      ideaSummary: string,
      ideaDescription: string,
      options?: {
        agentId?: string;
        breakdownStories?: boolean;
      },
    ): Promise<boolean> => {
      const agentId = options?.agentId;
      const shouldBreakdown = options?.breakdownStories ?? false;

      setStatus("generating");
      clearLogs(projectId);
      appendLog(
        projectId,
        "system",
        `Generating PRD from idea "${ideaTitle}"...`,
      );
      if (shouldBreakdown) {
        appendLog(
          projectId,
          "system",
          `Story breakdown enabled - will refine stories after initial generation`,
        );
      }

      try {
        const selectedAgentId = agentId || "amp";
        const plugin =
          defaultPlugins.find((p: AgentPlugin) => p.id === selectedAgentId) ||
          defaultPlugins[0];

        if (!plugin) {
          throw new Error("No agent plugin configured");
        }

        appendLog(projectId, "system", `Using agent: ${plugin.name}`);

        const prompt = getPrompt("prdFromIdea", {
          "{{projectName}}": projectName,
          "{{title}}": ideaTitle,
          "{{summary}}": ideaSummary || "No summary provided",
          "{{description}}":
            ideaDescription || "No detailed description provided",
        });

        const args = plugin.argsTemplate.map((arg: string) =>
          arg.replace("{{prompt}}", prompt),
        );

        appendLog(
          projectId,
          "system",
          `Spawning ${plugin.command} to generate PRD...`,
        );

        const startTime = Date.now();

        const spawnResult = await invoke<SpawnAgentResult>("spawn_agent", {
          executable: plugin.command,
          args,
          workingDirectory: projectPath,
        });

        setCurrentProcessId(projectId, spawnResult.process_id);
        appendLog(
          projectId,
          "system",
          `Agent started (process ID: ${spawnResult.process_id})`,
        );

        registerProcess({
          processId: spawnResult.process_id,
          agentId: plugin.id,
          command: {
            executable: plugin.command,
            args,
            workingDirectory: projectPath,
          },
          projectId,
          type: "prd",
          label: "PRD from Idea",
        });

        const waitResult = await invoke<WaitAgentResult>("wait_agent", {
          processId: spawnResult.process_id,
        });

        const durationMs = Date.now() - startTime;

        unregisterProcess(spawnResult.process_id);
        setCurrentProcessId(projectId, null);

        const logs = useBuildStore.getState().getProjectState(projectId).logs;
        const recentLogs = logs
          .slice(-50)
          .map((l) => l.content)
          .join("\n");
        parseAndAddFromOutput(
          projectId,
          projectPath,
          selectedAgentId,
          "PRD from Idea",
          recentLogs,
          durationMs,
        );

        if (!waitResult.success) {
          appendLog(
            projectId,
            "system",
            `Agent exited with error (code: ${waitResult.exit_code ?? "unknown"})`,
          );
          setStatus("error");
          return false;
        }

        appendLog(
          projectId,
          "system",
          "PRD generation completed. Loading generated PRD...",
        );

        const prd = await invoke<Prd | null>("load_prd", {
          projectPath,
        });

        if (prd && prd.userStories && prd.userStories.length > 0) {
          const stories = prd.userStories.map((story) => ({
            id: story.id,
            title: story.title,
            description: story.description,
            acceptanceCriteria: story.acceptanceCriteria,
            priority: story.priority,
            passes: story.passes,
            notes: story.notes,
          }));
          const metadata: PrdMetadata = {
            project: prd.project,
            description: prd.description,
            branchName: prd.branchName,
          };
          setPrd(stories, metadata, projectId);
          appendLog(
            projectId,
            "system",
            `PRD generated with ${stories.length} user stories from idea`,
          );

          if (shouldBreakdown) {
            appendLog(projectId, "system", "");
            appendLog(
              projectId,
              "system",
              "--- Starting Story Breakdown Pass ---",
            );
            const breakdownSuccess = await breakdownStories(
              projectId,
              projectName,
              projectPath,
              agentId,
            );
            if (!breakdownSuccess) {
              appendLog(
                projectId,
                "system",
                "Story breakdown failed, but initial PRD is available",
              );
            }
          } else {
            setStatus("ready");
          }

          return true;
        } else {
          appendLog(
            projectId,
            "system",
            "Warning: PRD file not found or empty after generation",
          );
          setStatus("error");
          return false;
        }
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        appendLog(projectId, "system", `Error: ${errorMessage}`);
        setStatus("error");
        return false;
      }
    },
    [
      setStatus,
      setPrd,
      appendLog,
      clearLogs,
      setCurrentProcessId,
      parseAndAddFromOutput,
      getPrompt,
      registerProcess,
      unregisterProcess,
      breakdownStories,
    ],
  );

  useEffect(() => {
    const handleGeneratePrdFromCodebase = (event: Event) => {
      const customEvent = event as CustomEvent<{
        projectId: string;
        projectPath: string;
        projectName: string;
      }>;
      const { projectId, projectPath, projectName } = customEvent.detail;
      generatePrdFromCodebase(projectId, projectName, projectPath);
    };

    window.addEventListener(
      "generate-prd-from-codebase",
      handleGeneratePrdFromCodebase,
    );
    return () => {
      window.removeEventListener(
        "generate-prd-from-codebase",
        handleGeneratePrdFromCodebase,
      );
    };
  }, [generatePrdFromCodebase]);

  return {
    generatePrd,
    generatePrdFromCodebase,
    generateAdditionalStories,
    generatePrdFromIdea,
    breakdownStories,
  };
}
