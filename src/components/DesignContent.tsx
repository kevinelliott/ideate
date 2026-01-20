import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useProjectStore } from "../stores/projectStore";

interface PreviewServerInfo {
  serverId: string;
  port: number;
  url: string;
}

interface DesignContentProps {
  projectId: string;
}

export function DesignContent({ projectId }: DesignContentProps) {
  const project = useProjectStore((state) =>
    state.projects.find((p) => p.id === projectId)
  );

  const [designFiles, setDesignFiles] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasDesignFolder, setHasDesignFolder] = useState(false);
  
  // Preview state
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewServerId, setPreviewServerId] = useState<string | null>(null);
  const [isStartingPreview, setIsStartingPreview] = useState(false);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState<string | null>(null);

  useEffect(() => {
    if (!project?.path) return;

    const loadDesignFiles = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const designPath = `${project.path}/design`;
        const files = await invoke<string[]>("list_directory", { path: designPath });
        setDesignFiles(files.filter(f => !f.startsWith(".")));
        setHasDesignFolder(true);
      } catch {
        setHasDesignFolder(false);
        setDesignFiles([]);
      } finally {
        setIsLoading(false);
      }
    };

    loadDesignFiles();

    // Cleanup preview server on unmount
    return () => {
      if (previewServerId) {
        invoke("stop_preview_server", { serverId: previewServerId }).catch(() => {});
      }
    };
  }, [project?.path]);

  const startPreview = async () => {
    if (!project?.path) return;

    setIsStartingPreview(true);
    try {
      const designPath = `${project.path}/design`;
      const serverInfo = await invoke<PreviewServerInfo>("start_preview_server", {
        directory: designPath,
        entryFile: "index.html",
      });
      setPreviewServerId(serverInfo.serverId);
      setPreviewUrl(serverInfo.url);
    } catch (err) {
      setError(`Failed to start preview: ${err}`);
    } finally {
      setIsStartingPreview(false);
    }
  };

  const stopPreview = async () => {
    if (previewServerId) {
      try {
        await invoke("stop_preview_server", { serverId: previewServerId });
      } catch {
        // Ignore errors
      }
      setPreviewServerId(null);
      setPreviewUrl(null);
    }
  };

  const loadFileContent = async (filename: string) => {
    if (!project?.path) return;

    try {
      const content = await invoke<string>("read_project_file", {
        projectPath: project.path,
        relativePath: `design/${filename}`,
      });
      setSelectedFile(filename);
      setFileContent(content);
    } catch (err) {
      setError(`Failed to load file: ${err}`);
    }
  };

  if (!project) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted">
        Project not found
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
          <span className="text-sm text-muted">Loading design files...</span>
        </div>
      </div>
    );
  }

  if (!hasDesignFolder) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center max-w-md">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-muted/10 flex items-center justify-center">
            <svg className="w-8 h-8 text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
          <h3 className="text-lg font-medium text-foreground mb-2">No Design Files</h3>
          <p className="text-sm text-muted mb-4">
            Generate visual design during project creation or add files to the design/ folder.
          </p>
        </div>
      </div>
    );
  }

  const getFileIcon = (filename: string) => {
    const ext = filename.split(".").pop()?.toLowerCase();
    if (ext === "html") return "M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4";
    if (ext === "css") return "M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01";
    if (ext === "js" || ext === "ts") return "M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z";
    if (["png", "jpg", "jpeg", "gif", "svg", "webp"].includes(ext || "")) return "M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z";
    return "M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z";
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-border bg-background-secondary">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold text-foreground">Design</h1>
            <p className="text-sm text-muted">
              Visual design files for {project.name}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {previewUrl ? (
              <button
                onClick={stopPreview}
                className="flex items-center gap-2 px-3 py-1.5 bg-destructive text-white rounded-lg text-sm hover:bg-destructive/90 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 10a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" />
                </svg>
                Stop Preview
              </button>
            ) : (
              <button
                onClick={startPreview}
                disabled={isStartingPreview || designFiles.length === 0}
                className="flex items-center gap-2 px-3 py-1.5 bg-accent text-white rounded-lg text-sm hover:bg-accent/90 transition-colors disabled:opacity-50"
              >
                {isStartingPreview ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Starting...
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    Preview Design
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>

      {error && (
        <div className="px-6 py-3 bg-destructive/10 border-b border-destructive/20">
          <p className="text-sm text-destructive">{error}</p>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* File list sidebar */}
        <div className="w-64 border-r border-border overflow-y-auto bg-background-secondary">
          <div className="p-3">
            <h3 className="text-xs font-medium text-muted uppercase tracking-wider mb-2">
              Files ({designFiles.length})
            </h3>
            <ul className="space-y-1">
              {designFiles.map((file) => (
                <li key={file}>
                  <button
                    onClick={() => loadFileContent(file)}
                    className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm transition-colors ${
                      selectedFile === file
                        ? "bg-accent text-white"
                        : "text-secondary hover:text-foreground hover:bg-card"
                    }`}
                  >
                    <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={getFileIcon(file)} />
                    </svg>
                    <span className="truncate">{file}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Main content area */}
        <div className="flex-1 overflow-hidden flex flex-col">
          {previewUrl ? (
            <div className="flex-1 bg-white">
              <iframe
                src={previewUrl}
                className="w-full h-full border-0"
                title="Design Preview"
              />
            </div>
          ) : selectedFile && fileContent !== null ? (
            <div className="flex-1 overflow-auto p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-medium text-foreground">{selectedFile}</h3>
                <button
                  onClick={() => {
                    setSelectedFile(null);
                    setFileContent(null);
                  }}
                  className="text-xs text-muted hover:text-foreground"
                >
                  Close
                </button>
              </div>
              <pre className="p-4 bg-card rounded-lg border border-border overflow-x-auto text-sm text-secondary font-mono whitespace-pre-wrap">
                {fileContent}
              </pre>
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <svg className="w-12 h-12 mx-auto text-muted mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                <p className="text-sm text-muted mb-2">Select a file to view its contents</p>
                <p className="text-xs text-muted">or click &quot;Preview Design&quot; to see the full design</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
