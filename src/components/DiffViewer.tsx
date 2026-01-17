import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useModalKeyboard } from "../hooks/useModalKeyboard";

interface FileDiff {
  filePath: string;
  diffContent: string;
  additions: number;
  deletions: number;
  status: "added" | "modified" | "deleted" | "renamed" | "copied";
}

interface StoryDiffResult {
  storyId: string;
  branchName: string;
  files: FileDiff[];
  totalAdditions: number;
  totalDeletions: number;
}

interface DiffViewerProps {
  isOpen: boolean;
  onClose: () => void;
  projectPath: string;
  storyId: string;
  storyTitle: string;
  branchName?: string;
}

function getStatusColor(status: string) {
  switch (status) {
    case "added":
      return "text-success";
    case "deleted":
      return "text-destructive";
    case "renamed":
    case "copied":
      return "text-accent";
    default:
      return "text-warning";
  }
}

function getStatusLabel(status: string) {
  switch (status) {
    case "added":
      return "A";
    case "deleted":
      return "D";
    case "renamed":
      return "R";
    case "copied":
      return "C";
    default:
      return "M";
  }
}

function DiffLine({ line, lineNumber }: { line: string; lineNumber: number }) {
  const isAddition = line.startsWith("+") && !line.startsWith("+++");
  const isDeletion = line.startsWith("-") && !line.startsWith("---");
  const isHeader = line.startsWith("@@") || line.startsWith("diff ") || line.startsWith("index ") || line.startsWith("---") || line.startsWith("+++");

  let className = "text-secondary";
  if (isAddition) {
    className = "bg-success/10 text-success";
  } else if (isDeletion) {
    className = "bg-destructive/10 text-destructive";
  } else if (isHeader) {
    className = "text-accent bg-accent/5";
  }

  return (
    <div className={`flex font-mono text-xs ${className}`}>
      <span className="w-12 flex-shrink-0 text-right pr-2 text-muted select-none border-r border-border">
        {lineNumber}
      </span>
      <pre className="flex-1 pl-2 overflow-x-auto whitespace-pre">{line || " "}</pre>
    </div>
  );
}



export function DiffViewer({ isOpen, onClose, projectPath, storyId, storyTitle, branchName }: DiffViewerProps) {
  const [diffResult, setDiffResult] = useState<StoryDiffResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);

  useModalKeyboard(isOpen, onClose);

  const loadDiff = useCallback(async () => {
    if (!projectPath || !storyId) return;
    
    setLoading(true);
    setError(null);
    
    try {
      const result = await invoke<StoryDiffResult>("get_story_diff", {
        projectPath,
        storyId,
        branchName: branchName || null,
      });
      setDiffResult(result);
      if (result.files.length > 0) {
        setSelectedFile(result.files[0].filePath);
      }
    } catch (e) {
      setError(e as string);
    } finally {
      setLoading(false);
    }
  }, [projectPath, storyId, branchName]);

  useEffect(() => {
    if (isOpen) {
      loadDiff();
    } else {
      setDiffResult(null);
      setSelectedFile(null);
      setError(null);
    }
  }, [isOpen, loadDiff]);

  if (!isOpen) return null;

  const selectedFileDiff = diffResult?.files.find(f => f.filePath === selectedFile);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative w-[90vw] max-w-6xl h-[85vh] bg-background rounded-xl shadow-2xl border border-border flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-border bg-background-secondary flex items-center justify-between">
          <div className="flex items-center gap-3">
            <svg className="w-5 h-5 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <div>
              <h2 className="text-lg font-semibold text-foreground">
                Changes for {storyId}
              </h2>
              <p className="text-sm text-muted truncate max-w-md">{storyTitle}</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            {diffResult && (
              <div className="flex items-center gap-3 text-sm">
                <span className="text-muted">{diffResult.files.length} files</span>
                <span className="text-success">+{diffResult.totalAdditions}</span>
                <span className="text-destructive">-{diffResult.totalDeletions}</span>
              </div>
            )}
            <button
              onClick={onClose}
              className="p-2 rounded-lg hover:bg-card transition-colors text-muted hover:text-foreground"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 flex overflow-hidden">
          {loading ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="flex items-center gap-3 text-muted">
                <svg className="w-5 h-5 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                <span>Loading diff...</span>
              </div>
            </div>
          ) : error ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <svg className="w-12 h-12 mx-auto text-destructive/50 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <p className="text-destructive font-medium mb-1">Failed to load diff</p>
                <p className="text-sm text-muted">{error}</p>
              </div>
            </div>
          ) : diffResult?.files.length === 0 ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <svg className="w-12 h-12 mx-auto text-muted/50 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <p className="text-muted">No changes found for this story</p>
              </div>
            </div>
          ) : (
            <>
              {/* File list sidebar */}
              <div className="w-64 border-r border-border flex flex-col bg-background-secondary">
                <div className="px-3 py-2 border-b border-border">
                  <span className="text-xs font-medium text-muted uppercase tracking-wide">
                    Changed Files
                  </span>
                </div>
                <div className="flex-1 overflow-y-auto scrollbar-auto-hide">
                  {diffResult?.files.map((file) => (
                    <button
                      key={file.filePath}
                      onClick={() => setSelectedFile(file.filePath)}
                      className={`w-full px-3 py-2 text-left flex items-center gap-2 hover:bg-card/50 transition-colors ${
                        selectedFile === file.filePath ? "bg-card" : ""
                      }`}
                    >
                      <span className={`text-[10px] font-medium px-1 rounded ${getStatusColor(file.status)} bg-current/10`}>
                        {getStatusLabel(file.status)}
                      </span>
                      <span className="flex-1 font-mono text-xs text-foreground truncate" title={file.filePath}>
                        {file.filePath.split("/").pop()}
                      </span>
                      <span className="text-[10px] text-muted">
                        <span className="text-success">+{file.additions}</span>
                        {" "}
                        <span className="text-destructive">-{file.deletions}</span>
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Diff content */}
              <div className="flex-1 overflow-hidden flex flex-col">
                {selectedFileDiff ? (
                  <>
                    <div className="px-4 py-2 border-b border-border bg-background-secondary flex items-center justify-between">
                      <span className="font-mono text-sm text-foreground">{selectedFileDiff.filePath}</span>
                      <div className="flex items-center gap-2 text-xs">
                        <span className="text-success">+{selectedFileDiff.additions}</span>
                        <span className="text-destructive">-{selectedFileDiff.deletions}</span>
                      </div>
                    </div>
                    <div className="flex-1 overflow-y-auto scrollbar-auto-hide bg-background">
                      {selectedFileDiff.diffContent.split("\n").map((line, i) => (
                        <DiffLine key={i} line={line} lineNumber={i + 1} />
                      ))}
                    </div>
                  </>
                ) : (
                  <div className="flex-1 flex items-center justify-center text-muted">
                    Select a file to view diff
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        {diffResult && (
          <div className="px-6 py-3 border-t border-border bg-background-secondary flex items-center justify-between">
            <span className="text-xs text-muted">
              Branch: <code className="text-accent">{diffResult.branchName}</code>
            </span>
            <button
              onClick={onClose}
              className="px-4 py-1.5 text-sm rounded-lg bg-accent text-white hover:bg-accent/90 transition-colors"
            >
              Close
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
