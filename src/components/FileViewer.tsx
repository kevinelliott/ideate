import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { CodeViewer } from "./CodeViewer";

interface FileEntry {
  name: string;
  path: string;
  is_dir: boolean;
  children: FileEntry[] | null;
}

interface FileViewerProps {
  projectPath: string;
  onClose: () => void;
}

function FileIcon({ isDir, name }: { isDir: boolean; name: string }) {
  if (isDir) {
    return (
      <svg className="w-4 h-4 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
      </svg>
    );
  }

  const ext = name.split(".").pop()?.toLowerCase() || "";
  const iconColors: Record<string, string> = {
    ts: "text-blue-400", tsx: "text-blue-400",
    js: "text-yellow-400", jsx: "text-yellow-400",
    json: "text-yellow-600", css: "text-purple-400",
    rs: "text-orange-400", py: "text-green-400",
    md: "text-gray-400", html: "text-red-400"
  };

  return (
    <svg className={`w-4 h-4 ${iconColors[ext] || "text-muted"}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
  );
}

function FileTreeItem({
  entry,
  depth,
  selectedPath,
  expandedDirs,
  onSelect,
  onToggleDir
}: {
  entry: FileEntry;
  depth: number;
  selectedPath: string | null;
  expandedDirs: Set<string>;
  onSelect: (path: string) => void;
  onToggleDir: (path: string) => void;
}) {
  const isExpanded = expandedDirs.has(entry.path);
  const isSelected = selectedPath === entry.path;

  const handleClick = () => {
    if (entry.is_dir) {
      onToggleDir(entry.path);
    } else {
      onSelect(entry.path);
    }
  };

  return (
    <>
      <button
        onClick={handleClick}
        className={`w-full flex items-center gap-2 px-2 py-1 text-left hover:bg-card/50 transition-colors ${
          isSelected ? "bg-accent/20 text-accent" : "text-foreground"
        }`}
        style={{ paddingLeft: `${8 + depth * 16}px` }}
      >
        {entry.is_dir && (
          <svg
            className={`w-3 h-3 text-muted transition-transform ${isExpanded ? "rotate-90" : ""}`}
            fill="none" stroke="currentColor" viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        )}
        {!entry.is_dir && <span className="w-3" />}
        <FileIcon isDir={entry.is_dir} name={entry.name} />
        <span className="truncate text-sm">{entry.name}</span>
      </button>
      {entry.is_dir && isExpanded && entry.children && (
        <div>
          {entry.children.map((child) => (
            <FileTreeItem
              key={child.path}
              entry={child}
              depth={depth + 1}
              selectedPath={selectedPath}
              expandedDirs={expandedDirs}
              onSelect={onSelect}
              onToggleDir={onToggleDir}
            />
          ))}
        </div>
      )}
    </>
  );
}

export function FileViewer({ projectPath, onClose }: FileViewerProps) {
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set());
  const [fileContent, setFileContent] = useState<string | null>(null);
  const [loadingFile, setLoadingFile] = useState(false);

  const loadFiles = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await invoke<FileEntry[]>("list_project_files", {
        projectPath,
        maxDepth: 10
      });
      setFiles(result);
    } catch (e) {
      setError(e as string);
    } finally {
      setLoading(false);
    }
  }, [projectPath]);

  useEffect(() => {
    loadFiles();
  }, [loadFiles]);

  useEffect(() => {
    const interval = setInterval(() => {
      loadFiles();
    }, 5000);
    return () => clearInterval(interval);
  }, [loadFiles]);

  const handleSelectFile = async (path: string) => {
    setSelectedPath(path);
    setLoadingFile(true);
    try {
      const content = await invoke<string>("read_project_file", {
        projectPath,
        relativePath: path
      });
      setFileContent(content);
    } catch (e) {
      setFileContent(`Error loading file: ${e}`);
    } finally {
      setLoadingFile(false);
    }
  };

  const handleToggleDir = (path: string) => {
    setExpandedDirs((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  };

  return (
    <div className="flex flex-col h-full bg-background border-l border-border">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-background-secondary">
        <div className="flex items-center gap-2">
          <svg className="w-4 h-4 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
          </svg>
          <span className="text-sm font-medium text-foreground">Project Files</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={loadFiles}
            className="p-1.5 rounded hover:bg-card transition-colors text-muted hover:text-foreground"
            title="Refresh files"
          >
            <svg className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
          <button
            onClick={onClose}
            className="p-1.5 rounded hover:bg-card transition-colors text-muted hover:text-foreground"
            title="Close file viewer"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        <div className="w-56 flex-shrink-0 border-r border-border overflow-y-auto scrollbar-auto-hide">
          {loading && files.length === 0 ? (
            <div className="flex items-center justify-center h-32 text-muted text-sm">
              Loading...
            </div>
          ) : error ? (
            <div className="p-3 text-sm text-destructive">{error}</div>
          ) : files.length === 0 ? (
            <div className="p-3 text-sm text-muted">No files found</div>
          ) : (
            <div className="py-1">
              {files.map((entry) => (
                <FileTreeItem
                  key={entry.path}
                  entry={entry}
                  depth={0}
                  selectedPath={selectedPath}
                  expandedDirs={expandedDirs}
                  onSelect={handleSelectFile}
                  onToggleDir={handleToggleDir}
                />
              ))}
            </div>
          )}
        </div>

        <div className="flex-1 flex flex-col overflow-hidden">
          {selectedPath ? (
            <>
              <div className="px-3 py-2 border-b border-border bg-background-secondary flex items-center justify-between">
                <span className="font-mono text-xs text-foreground truncate">{selectedPath}</span>
              </div>
              <div className="flex-1 overflow-hidden">
                {loadingFile ? (
                  <div className="flex items-center justify-center h-full text-muted text-sm">
                    Loading file...
                  </div>
                ) : fileContent !== null ? (
                  <CodeViewer content={fileContent} fileName={selectedPath} />
                ) : null}
              </div>
            </>
          ) : (
            <div className="flex items-center justify-center h-full text-muted text-sm">
              Select a file to view
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
