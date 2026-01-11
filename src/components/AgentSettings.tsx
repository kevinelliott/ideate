import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { defaultPlugins, type AgentPlugin } from "../types";

export type AutonomyLevel = "autonomous" | "pause-between" | "manual";

interface ProjectSettings {
  agent: string | null;
  autonomy: AutonomyLevel;
}

interface AgentSettingsProps {
  projectPath: string;
}

const autonomyOptions: { value: AutonomyLevel; label: string }[] = [
  { value: "autonomous", label: "Autonomous" },
  { value: "pause-between", label: "Pause Between Stories" },
  { value: "manual", label: "Manual" },
];

export function AgentSettings({ projectPath }: AgentSettingsProps) {
  const [selectedAgent, setSelectedAgent] = useState<string>("");
  const [autonomyLevel, setAutonomyLevel] =
    useState<AutonomyLevel>("autonomous");
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function loadSettings() {
      try {
        const settings = await invoke<ProjectSettings | null>(
          "load_project_settings",
          { projectPath }
        );
        if (settings) {
          setSelectedAgent(settings.agent || "");
          setAutonomyLevel(settings.autonomy || "autonomous");
        }
      } catch (err) {
        console.error("Failed to load project settings:", err);
      } finally {
        setIsLoading(false);
      }
    }
    loadSettings();
  }, [projectPath]);

  const handleAgentChange = async (agentId: string) => {
    setSelectedAgent(agentId);
    await saveSettings(agentId, autonomyLevel);
  };

  const handleAutonomyChange = async (level: AutonomyLevel) => {
    setAutonomyLevel(level);
    await saveSettings(selectedAgent, level);
  };

  const saveSettings = async (agent: string, autonomy: AutonomyLevel) => {
    try {
      await invoke("save_project_settings", {
        projectPath,
        agent: agent || null,
        autonomy,
      });
      console.log("Settings saved successfully");
    } catch (err) {
      console.error("Failed to save project settings:", err);
    }
  };

  if (isLoading) {
    return (
      <div className="border border-border rounded-xl bg-card p-6 mb-6">
        <p className="text-secondary text-sm">Loading settings...</p>
      </div>
    );
  }

  return (
    <div className="border border-border rounded-xl bg-card p-6 mb-6">
      <h2 className="text-lg font-medium text-foreground mb-4">
        Agent Settings
      </h2>
      <div className="space-y-4">
        <div>
          <label
            htmlFor="agent-select"
            className="block text-sm font-medium text-foreground mb-1.5"
          >
            AI Agent
          </label>
          <select
            id="agent-select"
            value={selectedAgent}
            onChange={(e) => handleAgentChange(e.target.value)}
            className="w-full px-3 py-2 bg-background border border-border rounded-lg text-foreground text-sm focus:ring-2 focus:ring-accent focus:border-transparent transition-all"
          >
            <option value="">Select an agent...</option>
            {defaultPlugins.map((plugin: AgentPlugin) => (
              <option key={plugin.id} value={plugin.id}>
                {plugin.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label
            htmlFor="autonomy-select"
            className="block text-sm font-medium text-foreground mb-1.5"
          >
            Autonomy Level
          </label>
          <select
            id="autonomy-select"
            value={autonomyLevel}
            onChange={(e) =>
              handleAutonomyChange(e.target.value as AutonomyLevel)
            }
            className="w-full px-3 py-2 bg-background border border-border rounded-lg text-foreground text-sm focus:ring-2 focus:ring-accent focus:border-transparent transition-all"
          >
            {autonomyOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <p className="mt-1.5 text-xs text-secondary">
            {autonomyLevel === "autonomous" &&
              "Agent runs continuously through all stories"}
            {autonomyLevel === "pause-between" &&
              "Pauses after each story for review"}
            {autonomyLevel === "manual" && "You control each story execution"}
          </p>
        </div>
      </div>
    </div>
  );
}
