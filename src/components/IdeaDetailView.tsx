import { useState, useEffect } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { open, save } from "@tauri-apps/plugin-dialog";
import { documentDir } from "@tauri-apps/api/path";
import { invoke } from "@tauri-apps/api/core";

import type { Idea } from "../stores/ideasStore";
import { useIdeasStore } from "../stores/ideasStore";
import { useIdeaGeneration } from "../hooks/useIdeaGeneration";
import { useProjectStore } from "../stores/projectStore";
import { usePrdGeneration } from "../hooks/usePrdGeneration";
import { useAgentStore } from "../stores/agentStore";
import { usePrdStore } from "../stores/prdStore";
import { useModalKeyboard } from "../hooks/useModalKeyboard";
import { exportIdeaToPdf } from "../utils/exportPdf";
import { notify } from "../utils/notify";

interface CreateProjectResult {
  path: string;
}

interface IdeaDetailViewProps {
  idea: Idea;
}

export function IdeaDetailView({ idea }: IdeaDetailViewProps) {
  const updateIdea = useIdeasStore((state) => state.updateIdea);
  const removeIdea = useIdeasStore((state) => state.removeIdea);
  const selectIdea = useIdeasStore((state) => state.selectIdea);

  const addProject = useProjectStore((state) => state.addProject);
  const setActiveProject = useProjectStore((state) => state.setActiveProject);

  const { generatePrdFromIdea } = usePrdGeneration();
  const initSession = useAgentStore((state) => state.initSession);
  const prdStatus = usePrdStore((state) => state.status);

  const [isEditing, setIsEditing] = useState(false);
  const [title, setTitle] = useState(idea.title);
  const [summary, setSummary] = useState(idea.summary);
  const [description, setDescription] = useState(idea.description);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  
  // Create project flow states
  const [showCreateConfirm, setShowCreateConfirm] = useState(false);
  const [generatePrd, setGeneratePrd] = useState(true);
  const [breakdownStories, setBreakdownStories] = useState(true);
  const [selectedDirectory, setSelectedDirectory] = useState<string | null>(null);
  const [isCreatingProject, setIsCreatingProject] = useState(false);
  const [showGeneratingModal, setShowGeneratingModal] = useState(false);
  const [, setCreatedProjectId] = useState<string | null>(null);
  const [isExportingPdf, setIsExportingPdf] = useState(false);

  const { generateDescription, isGenerating, generationType } = useIdeaGeneration();

  // Close generating modal when not generating anymore
  const isGeneratingPrd = prdStatus === 'generating';

  useModalKeyboard(showCreateConfirm && !isCreatingProject, () => setShowCreateConfirm(false));

  // Reset form when idea changes
  useEffect(() => {
    setTitle(idea.title);
    setSummary(idea.summary);
    setDescription(idea.description);
    setIsEditing(false);
    setShowDeleteConfirm(false);
    setShowCreateConfirm(false);
    setShowGeneratingModal(false);
    setSelectedDirectory(null);
    setCreatedProjectId(null);
  }, [idea.id, idea.title, idea.summary, idea.description]);

  const handleSave = async () => {
    if (isGenerating) return;
    await updateIdea(idea.id, {
      title: title.trim(),
      summary: summary.trim(),
      description: description.trim(),
    });
    setIsEditing(false);
  };

  const handleCancel = () => {
    if (isGenerating) return;
    setTitle(idea.title);
    setSummary(idea.summary);
    setDescription(idea.description);
    setIsEditing(false);
  };

  const handleDelete = async () => {
    await removeIdea(idea.id);
    selectIdea(null);
  };

  const handleGenerate = async () => {
    const result = await generateDescription('generate', title, summary, description);
    if (result) {
      setDescription(result);
    }
  };

  const handleShorten = async () => {
    const result = await generateDescription('shorten', title, summary, description);
    if (result) {
      setDescription(result);
    }
  };

  const handleLengthen = async () => {
    const result = await generateDescription('lengthen', title, summary, description);
    if (result) {
      setDescription(result);
    }
  };

  const handleSimplify = async () => {
    const result = await generateDescription('simplify', title, summary, description);
    if (result) {
      setDescription(result);
    }
  };

  const handleStartCreateProject = async () => {
    try {
      const defaultPath = await documentDir();
      const selected = await open({
        directory: true,
        multiple: false,
        defaultPath,
        title: "Choose Project Directory",
      });

      if (selected) {
        setSelectedDirectory(selected);
        setShowCreateConfirm(true);
      }
    } catch (error) {
      console.error("Failed to open directory picker:", error);
    }
  };

  const handleConfirmCreateProject = async () => {
    if (!selectedDirectory) return;
    
    setIsCreatingProject(true);

    try {
      const projectName = idea.title.trim();
      const result = await invoke<CreateProjectResult>("create_project", {
        name: projectName,
        description: idea.summary || idea.description?.slice(0, 200) || "",
        parentPath: selectedDirectory,
      });

      const newProject = addProject({
        name: projectName,
        description: idea.summary || "",
        path: result.path,
        status: generatePrd ? "generating" : "idle",
      });

      initSession(newProject.id);
      setCreatedProjectId(newProject.id);

      // Close confirmation modal
      setShowCreateConfirm(false);
      setIsCreatingProject(false);

      if (generatePrd) {
        // Show generating modal
        setShowGeneratingModal(true);
        
        // Set as active project
        setActiveProject(newProject.id);
        
        // Start PRD generation with optional breakdown (fire and forget)
        generatePrdFromIdea(
          newProject.id,
          projectName,
          result.path,
          idea.title,
          idea.summary,
          idea.description,
          { breakdownStories }
        );
      } else {
        // Just switch to the project without generating
        setActiveProject(newProject.id);
        selectIdea(null);
      }
    } catch (error) {
      console.error("Failed to create project:", error);
      setIsCreatingProject(false);
    }
  };

  const handleDismissGenerating = () => {
    // Dismiss modal but generation continues in background
    setShowGeneratingModal(false);
    selectIdea(null);
  };

  const handleCancelCreate = () => {
    setShowCreateConfirm(false);
    setSelectedDirectory(null);
  };

  const handleExportPdf = async () => {
    if (isExportingPdf) return;
    
    setIsExportingPdf(true);
    
    try {
      const defaultPath = await documentDir();
      const fileName = `${idea.title.trim().replace(/[^a-zA-Z0-9\s-]/g, "").replace(/\s+/g, "-").toLowerCase()}.pdf`;
      
      const filePath = await save({
        defaultPath: `${defaultPath}/${fileName}`,
        filters: [{ name: "PDF", extensions: ["pdf"] }],
        title: "Export Idea as PDF",
      });
      
      if (filePath) {
        const pdfBlob = exportIdeaToPdf({ idea });
        const arrayBuffer = await pdfBlob.arrayBuffer();
        const data = Array.from(new Uint8Array(arrayBuffer));
        
        await invoke("write_binary_file", { path: filePath, data });
        notify.success("PDF exported", `Saved to ${filePath.split("/").pop()}`);
      }
    } catch (error) {
      console.error("Failed to export PDF:", error);
      notify.error("Export failed", "Could not save PDF file");
    } finally {
      setIsExportingPdf(false);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const canGenerate = title.trim().length > 0 && !isGenerating;
  const canModify = description.trim().length > 0 && !isGenerating;

  const AIButton = ({
    onClick,
    disabled,
    isActive,
    icon,
    label,
    buttonTitle,
  }: {
    onClick: () => void;
    disabled: boolean;
    isActive: boolean;
    icon: React.ReactNode;
    label: string;
    buttonTitle: string;
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
          : "text-muted hover:text-foreground hover:bg-background border border-transparent hover:border-border"
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

  return (
    <main className="flex-1 h-screen flex flex-col bg-background-secondary border-t border-border">
      {/* Header */}
      <div className="flex items-center justify-between px-6 h-14 border-b border-border flex-shrink-0 bg-background drag-region">
        <div className="flex items-center gap-3 min-w-0 flex-1 no-drag">
          <div className="w-8 h-8 rounded-lg bg-accent/15 border border-accent/20 flex items-center justify-center flex-shrink-0">
            <svg
              className="w-4 h-4 text-accent"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M12 18v-5.25m0 0a6.01 6.01 0 001.5-.189m-1.5.189a6.01 6.01 0 01-1.5-.189m3.75 7.478a12.06 12.06 0 01-4.5 0m3.75 2.383a14.406 14.406 0 01-3 0M14.25 18v-.192c0-.983.658-1.823 1.508-2.316a7.5 7.5 0 10-7.517 0c.85.493 1.509 1.333 1.509 2.316V18"
              />
            </svg>
          </div>
          {isEditing ? (
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="flex-1 min-w-0 text-xl font-semibold bg-transparent border-b border-accent focus:outline-none"
              placeholder="Idea title"
              disabled={isGenerating}
            />
          ) : (
            <h1 className="text-xl font-semibold truncate">{idea.title}</h1>
          )}
        </div>

        <div className="flex items-center gap-2 flex-shrink-0 no-drag">
          {isEditing ? (
            <>
              <button
                onClick={handleCancel}
                disabled={isGenerating}
                className="px-3 py-1.5 rounded-lg text-sm text-secondary hover:text-foreground hover:bg-card transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={isGenerating}
                className="px-3 py-1.5 rounded-lg text-sm bg-accent text-white font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                Save
              </button>
            </>
          ) : (
            <>
              <button
                onClick={handleStartCreateProject}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm bg-accent text-white font-medium hover:opacity-90 transition-opacity"
                title="Create a new project from this idea"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 10.5v6m3-3H9m4.06-7.19l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />
                </svg>
                Create Project
              </button>
              <button
                onClick={handleExportPdf}
                disabled={isExportingPdf}
                className="p-1.5 rounded-lg text-secondary hover:text-foreground hover:bg-card transition-colors disabled:opacity-50"
                title="Export as PDF"
              >
                {isExportingPdf ? (
                  <svg
                    className="w-5 h-5 animate-spin"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.5}
                      d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                    />
                  </svg>
                ) : (
                  <svg
                    className="w-5 h-5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.5}
                      d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"
                    />
                  </svg>
                )}
              </button>
              <button
                onClick={() => setIsEditing(true)}
                className="p-1.5 rounded-lg text-secondary hover:text-foreground hover:bg-card transition-colors"
                title="Edit idea"
              >
                <svg
                  className="w-5 h-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10"
                  />
                </svg>
              </button>
              <button
                onClick={() => setShowDeleteConfirm(true)}
                className="p-1.5 rounded-lg text-secondary hover:text-destructive hover:bg-destructive/10 transition-colors"
                title="Delete idea"
              >
                <svg
                  className="w-5 h-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"
                  />
                </svg>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="relative flex-1 overflow-hidden">
        <div className="absolute inset-0 overflow-auto p-6">
          <div className="space-y-6 pb-16">
          {isEditing ? (
            <>
              <div>
                <label className="block text-sm font-medium text-secondary mb-1.5">
                  Summary
                </label>
                <input
                  type="text"
                  value={summary}
                  onChange={(e) => setSummary(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-card border border-border text-foreground focus:outline-none focus:border-accent"
                  placeholder="Brief summary of the idea"
                  disabled={isGenerating}
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-sm font-medium text-secondary">
                    Description
                  </label>
                  <div className="flex items-center gap-1">
                    <AIButton
                      onClick={handleGenerate}
                      disabled={!canGenerate}
                      isActive={isGenerating && generationType === 'generate'}
                      buttonTitle="Generate description from title and summary"
                      label="Generate"
                      icon={
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
                        </svg>
                      }
                    />
                    <AIButton
                      onClick={handleShorten}
                      disabled={!canModify}
                      isActive={isGenerating && generationType === 'shorten'}
                      buttonTitle="Make description more concise"
                      label="Shorten"
                      icon={
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19.5 12h-15" />
                        </svg>
                      }
                    />
                    <AIButton
                      onClick={handleLengthen}
                      disabled={!canModify}
                      isActive={isGenerating && generationType === 'lengthen'}
                      buttonTitle="Expand with more detail"
                      label="Lengthen"
                      icon={
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4.5v15m7.5-7.5h-15" />
                        </svg>
                      }
                    />
                    <AIButton
                      onClick={handleSimplify}
                      disabled={!canModify}
                      isActive={isGenerating && generationType === 'simplify'}
                      buttonTitle="Simplify language and structure"
                      label="Simplify"
                      icon={
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
                        </svg>
                      }
                    />
                  </div>
                </div>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full h-96 px-3 py-2 rounded-lg bg-card border border-border text-foreground focus:outline-none focus:border-accent resize-none font-mono text-sm"
                  placeholder="Detailed description (Markdown supported)"
                  disabled={isGenerating}
                />
              </div>
            </>
          ) : (
            <>
              {idea.summary && (
                <div className="text-secondary text-lg">{idea.summary}</div>
              )}

              {idea.description ? (
                <div className="bg-card rounded-lg border border-border p-6">
                  <div className="prose prose-sm">
                    <Markdown remarkPlugins={[remarkGfm]}>{idea.description}</Markdown>
                  </div>
                </div>
              ) : (
                <div className="text-muted text-sm italic">
                  No description provided. Click edit to add one.
                </div>
              )}

              <div className="pt-6 border-t border-border">
                <p className="text-xs text-muted">
                  Created {formatDate(idea.createdAt)}
                </p>
              </div>
            </>
          )}
          </div>
        </div>
        
        {/* Bottom fade overlay */}
        <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-20 bg-gradient-to-t from-background-secondary to-transparent" />
      </div>

      {/* Delete confirmation modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-card rounded-xl shadow-2xl w-full max-w-md overflow-hidden">
            <div className="px-6 py-4 border-b border-border">
              <h2 className="text-lg font-semibold">Delete Idea</h2>
            </div>
            <div className="p-6">
              <p className="text-secondary">
                Are you sure you want to delete "{idea.title}"? This action cannot be undone.
              </p>
            </div>
            <div className="flex justify-end gap-3 px-6 py-4 border-t border-border bg-background-secondary">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="px-4 py-2 rounded-lg text-secondary hover:text-foreground hover:bg-card transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                className="px-4 py-2 rounded-lg bg-destructive text-white font-medium hover:opacity-90 transition-opacity"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create project confirmation modal */}
      {showCreateConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-card rounded-xl shadow-2xl w-full max-w-lg overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-accent/15 border border-accent/20 flex items-center justify-center">
                  <svg
                    className="w-4 h-4 text-accent"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 10.5v6m3-3H9m4.06-7.19l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />
                  </svg>
                </div>
                <div>
                  <h2 className="text-lg font-semibold">Create Project</h2>
                  <p className="text-xs text-muted">From: {idea.title}</p>
                </div>
              </div>
              {!isCreatingProject && (
                <button
                  onClick={handleCancelCreate}
                  className="p-1.5 rounded-lg text-muted hover:text-foreground hover:bg-card transition-colors"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>

            <div className="p-6 space-y-4">
              {isCreatingProject ? (
                <div className="flex flex-col items-center justify-center py-6">
                  <svg
                    className="w-10 h-10 text-accent animate-spin"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.5}
                      d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                    />
                  </svg>
                  <p className="mt-4 text-sm font-medium text-foreground">Creating Project...</p>
                </div>
              ) : (
                <>
                  <div>
                    <label className="block text-sm font-medium text-secondary mb-1.5">
                      Project Location
                    </label>
                    <div className="px-3 py-2 rounded-lg bg-background border border-border text-sm text-muted">
                      {selectedDirectory}/{idea.title.trim().replace(/\s+/g, '-').toLowerCase()}
                    </div>
                  </div>

                  <div className="flex items-start gap-3 p-4 rounded-lg bg-background border border-border">
                    <input
                      type="checkbox"
                      id="generate-prd"
                      checked={generatePrd}
                      onChange={(e) => setGeneratePrd(e.target.checked)}
                      className="mt-0.5 w-4 h-4 rounded border-border text-accent focus:ring-accent"
                    />
                    <div>
                      <label htmlFor="generate-prd" className="text-sm font-medium text-foreground cursor-pointer">
                        Generate PRD with User Stories
                      </label>
                      <p className="text-xs text-muted mt-0.5">
                        AI will analyze your idea and create 8-15 user stories with acceptance criteria, prioritized for implementation.
                      </p>
                    </div>
                  </div>

                  {generatePrd && (
                    <div className="flex items-start gap-3 p-4 rounded-lg bg-background border border-border">
                      <input
                        type="checkbox"
                        id="breakdown-stories"
                        checked={breakdownStories}
                        onChange={(e) => setBreakdownStories(e.target.checked)}
                        className="mt-0.5 w-4 h-4 rounded border-border text-accent focus:ring-accent"
                      />
                      <div>
                        <label htmlFor="breakdown-stories" className="text-sm font-medium text-foreground cursor-pointer">
                          Break Down Complex Stories
                        </label>
                        <p className="text-xs text-muted mt-0.5">
                          After initial generation, AI will evaluate each story and break down any that are too complex into smaller, single-iteration stories. May result in 50-100+ stories for complex ideas.
                        </p>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>

            <div className="flex justify-end gap-3 px-6 py-4 border-t border-border bg-background-secondary">
              {!isCreatingProject && (
                <>
                  <button
                    onClick={handleCancelCreate}
                    className="px-4 py-2 rounded-lg text-secondary hover:text-foreground hover:bg-card transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleConfirmCreateProject}
                    className="px-4 py-2 rounded-lg bg-accent text-white font-medium hover:opacity-90 transition-opacity flex items-center gap-2"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    Create Project
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* PRD Generation progress modal (dismissable) */}
      {showGeneratingModal && isGeneratingPrd && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-card rounded-xl shadow-2xl w-full max-w-md overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-500/20 to-pink-500/20 border border-purple-500/30 flex items-center justify-center">
                  <svg
                    className="w-4 h-4 text-purple-400 animate-spin"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.5}
                      d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z"
                    />
                  </svg>
                </div>
                <div>
                  <h2 className="text-lg font-semibold">Generating PRD</h2>
                  <p className="text-xs text-muted">
                    {breakdownStories 
                      ? "AI is creating and refining user stories..." 
                      : "AI is creating user stories..."}
                  </p>
                </div>
              </div>
            </div>

            <div className="p-6">
              <div className="flex flex-col items-center justify-center py-4">
                <svg
                  className="w-12 h-12 text-purple-400 animate-spin"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z"
                  />
                </svg>
                <p className="mt-4 text-sm font-medium text-foreground">Analyzing your idea...</p>
                <p className="mt-1 text-xs text-muted text-center">
                  {breakdownStories ? (
                    <>
                      Creating user stories, then breaking down complex ones.<br />
                      This may take a few minutes for thorough analysis.
                    </>
                  ) : (
                    <>
                      Creating 8-15 user stories with acceptance criteria.<br />
                      This may take a minute or two.
                    </>
                  )}
                </p>
              </div>
            </div>

            <div className="flex justify-end gap-3 px-6 py-4 border-t border-border bg-background-secondary">
              <button
                onClick={handleDismissGenerating}
                className="px-4 py-2 rounded-lg text-secondary hover:text-foreground hover:bg-card transition-colors flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                </svg>
                Run in Background
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
