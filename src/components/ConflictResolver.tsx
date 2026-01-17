import { useState, useEffect, useCallback, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useModalKeyboard } from "../hooks/useModalKeyboard";

interface DiffLine {
  type: "added" | "removed" | "unchanged" | "context";
  content: string;
  lineNumber: number | null;
}

function computeLineDiff(baseContent: string, newContent: string): DiffLine[] {
  const baseLines = baseContent.split("\n");
  const newLines = newContent.split("\n");
  const result: DiffLine[] = [];

  // Simple LCS-based diff
  const lcs = computeLCS(baseLines, newLines);
  
  let baseIdx = 0;
  let newIdx = 0;
  let lineNum = 1;

  for (const match of lcs) {
    // Add removed lines (in base but not matched)
    while (baseIdx < match.baseIdx) {
      result.push({ type: "removed", content: baseLines[baseIdx], lineNumber: null });
      baseIdx++;
    }
    // Add added lines (in new but not matched)
    while (newIdx < match.newIdx) {
      result.push({ type: "added", content: newLines[newIdx], lineNumber: lineNum });
      newIdx++;
      lineNum++;
    }
    // Add matched line
    result.push({ type: "unchanged", content: newLines[newIdx], lineNumber: lineNum });
    baseIdx++;
    newIdx++;
    lineNum++;
  }

  // Remaining removed lines
  while (baseIdx < baseLines.length) {
    result.push({ type: "removed", content: baseLines[baseIdx], lineNumber: null });
    baseIdx++;
  }
  // Remaining added lines
  while (newIdx < newLines.length) {
    result.push({ type: "added", content: newLines[newIdx], lineNumber: lineNum });
    newIdx++;
    lineNum++;
  }

  return result;
}

interface LCSMatch {
  baseIdx: number;
  newIdx: number;
}

function computeLCS(base: string[], updated: string[]): LCSMatch[] {
  const m = base.length;
  const n = updated.length;
  
  // Build LCS table
  const dp: number[][] = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));
  
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (base[i - 1] === updated[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  // Backtrack to find matches
  const matches: LCSMatch[] = [];
  let i = m, j = n;
  while (i > 0 && j > 0) {
    if (base[i - 1] === updated[j - 1]) {
      matches.unshift({ baseIdx: i - 1, newIdx: j - 1 });
      i--;
      j--;
    } else if (dp[i - 1][j] > dp[i][j - 1]) {
      i--;
    } else {
      j--;
    }
  }

  return matches;
}

interface ConflictFileInfo {
  filePath: string;
  oursContent: string;
  theirsContent: string;
  baseContent: string;
}

interface MergeConflictAnalysis {
  branchName: string;
  conflictingFiles: ConflictFileInfo[];
  nonConflictingCount: number;
}

interface FileResolution {
  filePath: string;
  strategy: "ours" | "theirs" | "both";
}

interface ConflictResolverProps {
  isOpen: boolean;
  onClose: () => void;
  onResolved: () => void;
  projectPath: string;
  branchName: string;
  storyTitle: string;
}

type ViewMode = "side-by-side" | "ours" | "theirs";

export function ConflictResolver({
  isOpen,
  onClose,
  onResolved,
  projectPath,
  branchName,
  storyTitle,
}: ConflictResolverProps) {
  const [analysis, setAnalysis] = useState<MergeConflictAnalysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [resolutions, setResolutions] = useState<Record<string, FileResolution["strategy"]>>({});
  const [merging, setMerging] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("side-by-side");

  useModalKeyboard(isOpen, onClose);

  const selectedFileInfo = analysis?.conflictingFiles.find((f) => f.filePath === selectedFile);

  // Compute diffs for the selected file
  const oursDiff = useMemo(() => {
    if (!selectedFileInfo) return [];
    return computeLineDiff(selectedFileInfo.baseContent, selectedFileInfo.oursContent);
  }, [selectedFileInfo]);

  const theirsDiff = useMemo(() => {
    if (!selectedFileInfo) return [];
    return computeLineDiff(selectedFileInfo.baseContent, selectedFileInfo.theirsContent);
  }, [selectedFileInfo]);

  const loadAnalysis = useCallback(async () => {
    if (!projectPath || !branchName) return;

    setLoading(true);
    setError(null);

    try {
      const result = await invoke<MergeConflictAnalysis>("analyze_merge_conflicts", {
        projectPath,
        branchName,
      });
      setAnalysis(result);
      if (result.conflictingFiles.length > 0) {
        setSelectedFile(result.conflictingFiles[0].filePath);
      }
      // Initialize resolutions to "theirs" (accept story changes) by default
      const defaultResolutions: Record<string, FileResolution["strategy"]> = {};
      for (const file of result.conflictingFiles) {
        defaultResolutions[file.filePath] = "theirs";
      }
      setResolutions(defaultResolutions);
    } catch (e) {
      setError(e as string);
    } finally {
      setLoading(false);
    }
  }, [projectPath, branchName]);

  useEffect(() => {
    if (isOpen) {
      loadAnalysis();
    } else {
      setAnalysis(null);
      setSelectedFile(null);
      setError(null);
      setResolutions({});
    }
  }, [isOpen, loadAnalysis]);

  const handleMerge = async () => {
    if (!analysis) return;

    setMerging(true);
    try {
      const fileResolutions: FileResolution[] = analysis.conflictingFiles.map((file) => ({
        filePath: file.filePath,
        strategy: resolutions[file.filePath] || "theirs",
      }));

      await invoke("merge_with_resolutions", {
        projectPath,
        branchName,
        resolutions: fileResolutions,
      });

      onResolved();
      onClose();
    } catch (e) {
      setError(e as string);
    } finally {
      setMerging(false);
    }
  };

  const handleCancel = async () => {
    try {
      await invoke("abort_merge", { projectPath });
    } catch {
      // Ignore errors
    }
    onClose();
  };

  if (!isOpen) return null;

  const allResolved = analysis?.conflictingFiles.every((f) => resolutions[f.filePath]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={handleCancel} />
      <div className="relative w-[95vw] max-w-7xl h-[90vh] bg-background rounded-xl shadow-2xl border border-border flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-border bg-background-secondary flex items-center justify-between">
          <div className="flex items-center gap-3">
            <svg className="w-5 h-5 text-warning" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <div>
              <h2 className="text-lg font-semibold text-foreground">Resolve Conflicts</h2>
              <p className="text-sm text-muted truncate max-w-md">{storyTitle}</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            {analysis && (
              <div className="flex items-center gap-3 text-sm">
                <span className="text-warning">{analysis.conflictingFiles.length} conflicts</span>
                <span className="text-success">{analysis.nonConflictingCount} clean</span>
              </div>
            )}
            <button
              onClick={handleCancel}
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
                <span>Analyzing conflicts...</span>
              </div>
            </div>
          ) : error ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <svg className="w-12 h-12 mx-auto text-destructive/50 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <p className="text-destructive font-medium mb-1">Failed to analyze conflicts</p>
                <p className="text-sm text-muted">{error}</p>
              </div>
            </div>
          ) : analysis?.conflictingFiles.length === 0 ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <svg className="w-12 h-12 mx-auto text-success/50 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <p className="text-success font-medium mb-1">No conflicts detected</p>
                <p className="text-sm text-muted">This branch can be merged cleanly.</p>
                <button
                  onClick={handleMerge}
                  disabled={merging}
                  className="mt-4 px-4 py-2 rounded-lg bg-success text-white hover:bg-success/90 transition-colors disabled:opacity-50"
                >
                  {merging ? "Merging..." : "Merge Now"}
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* File list sidebar */}
              <div className="w-72 border-r border-border flex flex-col bg-background-secondary">
                <div className="px-3 py-2 border-b border-border">
                  <span className="text-xs font-medium text-muted uppercase tracking-wide">
                    Conflicting Files
                  </span>
                </div>
                <div className="flex-1 overflow-y-auto scrollbar-auto-hide">
                  {analysis?.conflictingFiles.map((file) => (
                    <button
                      key={file.filePath}
                      onClick={() => setSelectedFile(file.filePath)}
                      className={`w-full px-3 py-2 text-left flex items-center gap-2 hover:bg-card/50 transition-colors ${
                        selectedFile === file.filePath ? "bg-card" : ""
                      }`}
                    >
                      <span className="flex-1 font-mono text-xs text-foreground truncate" title={file.filePath}>
                        {file.filePath.split("/").pop()}
                      </span>
                      <span
                        className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                          resolutions[file.filePath] === "ours"
                            ? "bg-blue-500/20 text-blue-400"
                            : resolutions[file.filePath] === "theirs"
                            ? "bg-success/20 text-success"
                            : resolutions[file.filePath] === "both"
                            ? "bg-purple-500/20 text-purple-400"
                            : "bg-muted/20 text-muted"
                        }`}
                      >
                        {resolutions[file.filePath] || "?"}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {/* File content and resolution */}
              <div className="flex-1 flex flex-col overflow-hidden">
                {selectedFileInfo ? (
                  <>
                    {/* File header with resolution buttons */}
                    <div className="px-4 py-3 border-b border-border bg-background-secondary">
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-mono text-sm text-foreground">{selectedFileInfo.filePath}</span>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => setViewMode("side-by-side")}
                            className={`text-xs px-2 py-1 rounded ${
                              viewMode === "side-by-side" ? "bg-accent text-white" : "bg-muted/20 text-muted hover:text-foreground"
                            }`}
                          >
                            Side by Side
                          </button>
                          <button
                            onClick={() => setViewMode("ours")}
                            className={`text-xs px-2 py-1 rounded ${
                              viewMode === "ours" ? "bg-blue-500 text-white" : "bg-muted/20 text-muted hover:text-foreground"
                            }`}
                          >
                            Ours
                          </button>
                          <button
                            onClick={() => setViewMode("theirs")}
                            className={`text-xs px-2 py-1 rounded ${
                              viewMode === "theirs" ? "bg-success text-white" : "bg-muted/20 text-muted hover:text-foreground"
                            }`}
                          >
                            Theirs
                          </button>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted">Resolution:</span>
                        <button
                          onClick={() => setResolutions((r) => ({ ...r, [selectedFileInfo.filePath]: "ours" }))}
                          className={`text-xs px-2 py-1 rounded flex items-center gap-1 ${
                            resolutions[selectedFileInfo.filePath] === "ours"
                              ? "bg-blue-500 text-white"
                              : "bg-blue-500/20 text-blue-400 hover:bg-blue-500/30"
                          }`}
                        >
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
                          </svg>
                          Keep Ours (main)
                        </button>
                        <button
                          onClick={() => setResolutions((r) => ({ ...r, [selectedFileInfo.filePath]: "theirs" }))}
                          className={`text-xs px-2 py-1 rounded flex items-center gap-1 ${
                            resolutions[selectedFileInfo.filePath] === "theirs"
                              ? "bg-success text-white"
                              : "bg-success/20 text-success hover:bg-success/30"
                          }`}
                        >
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7" />
                          </svg>
                          Keep Theirs (story)
                        </button>
                        <button
                          onClick={() => setResolutions((r) => ({ ...r, [selectedFileInfo.filePath]: "both" }))}
                          className={`text-xs px-2 py-1 rounded flex items-center gap-1 ${
                            resolutions[selectedFileInfo.filePath] === "both"
                              ? "bg-purple-500 text-white"
                              : "bg-purple-500/20 text-purple-400 hover:bg-purple-500/30"
                          }`}
                        >
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                          </svg>
                          Keep Both
                        </button>
                      </div>
                    </div>

                    {/* Content view */}
                    <div className="flex-1 overflow-hidden flex">
                      {viewMode === "side-by-side" ? (
                        <>
                          {/* Ours side */}
                          <div className="flex-1 flex flex-col border-r border-border">
                            <div className="px-3 py-1 bg-blue-500/10 border-b border-border flex items-center justify-between">
                              <span className="text-xs font-medium text-blue-400">Ours (main branch)</span>
                              <span className="text-[10px] text-muted">
                                +{oursDiff.filter(l => l.type === "added").length} 
                                -{oursDiff.filter(l => l.type === "removed").length}
                              </span>
                            </div>
                            <div className="flex-1 overflow-auto scrollbar-auto-hide bg-background font-mono text-xs">
                              {oursDiff.length === 0 ? (
                                <div className="p-2 text-muted">(empty or no changes from base)</div>
                              ) : (
                                oursDiff.map((line, i) => (
                                  <div
                                    key={i}
                                    className={`flex ${
                                      line.type === "added" ? "bg-success/15" :
                                      line.type === "removed" ? "bg-destructive/15" :
                                      ""
                                    }`}
                                  >
                                    <span className="w-10 flex-shrink-0 text-right pr-2 text-muted select-none border-r border-border text-[10px] py-0.5">
                                      {line.type === "removed" ? "-" : line.lineNumber || ""}
                                    </span>
                                    <span className={`flex-1 pl-1 py-0.5 whitespace-pre ${
                                      line.type === "added" ? "text-success" :
                                      line.type === "removed" ? "text-destructive" :
                                      "text-secondary"
                                    }`}>
                                      <span className="w-4 inline-block text-center">
                                        {line.type === "added" ? "+" : line.type === "removed" ? "-" : " "}
                                      </span>
                                      {line.content}
                                    </span>
                                  </div>
                                ))
                              )}
                            </div>
                          </div>
                          {/* Theirs side */}
                          <div className="flex-1 flex flex-col">
                            <div className="px-3 py-1 bg-success/10 border-b border-border flex items-center justify-between">
                              <span className="text-xs font-medium text-success">Theirs (story branch)</span>
                              <span className="text-[10px] text-muted">
                                +{theirsDiff.filter(l => l.type === "added").length} 
                                -{theirsDiff.filter(l => l.type === "removed").length}
                              </span>
                            </div>
                            <div className="flex-1 overflow-auto scrollbar-auto-hide bg-background font-mono text-xs">
                              {theirsDiff.length === 0 ? (
                                <div className="p-2 text-muted">(empty or no changes from base)</div>
                              ) : (
                                theirsDiff.map((line, i) => (
                                  <div
                                    key={i}
                                    className={`flex ${
                                      line.type === "added" ? "bg-success/15" :
                                      line.type === "removed" ? "bg-destructive/15" :
                                      ""
                                    }`}
                                  >
                                    <span className="w-10 flex-shrink-0 text-right pr-2 text-muted select-none border-r border-border text-[10px] py-0.5">
                                      {line.type === "removed" ? "-" : line.lineNumber || ""}
                                    </span>
                                    <span className={`flex-1 pl-1 py-0.5 whitespace-pre ${
                                      line.type === "added" ? "text-success" :
                                      line.type === "removed" ? "text-destructive" :
                                      "text-secondary"
                                    }`}>
                                      <span className="w-4 inline-block text-center">
                                        {line.type === "added" ? "+" : line.type === "removed" ? "-" : " "}
                                      </span>
                                      {line.content}
                                    </span>
                                  </div>
                                ))
                              )}
                            </div>
                          </div>
                        </>
                      ) : (
                        <div className="flex-1 overflow-auto scrollbar-auto-hide bg-background font-mono text-xs">
                          {(viewMode === "ours" ? oursDiff : theirsDiff).length === 0 ? (
                            <div className="p-2 text-muted">(empty or no changes from base)</div>
                          ) : (
                            (viewMode === "ours" ? oursDiff : theirsDiff).map((line, i) => (
                              <div
                                key={i}
                                className={`flex ${
                                  line.type === "added" ? "bg-success/15" :
                                  line.type === "removed" ? "bg-destructive/15" :
                                  ""
                                }`}
                              >
                                <span className="w-12 flex-shrink-0 text-right pr-2 text-muted select-none border-r border-border text-[10px] py-0.5">
                                  {line.type === "removed" ? "-" : line.lineNumber || ""}
                                </span>
                                <span className={`flex-1 pl-1 py-0.5 whitespace-pre ${
                                  line.type === "added" ? "text-success" :
                                  line.type === "removed" ? "text-destructive" :
                                  "text-secondary"
                                }`}>
                                  <span className="w-4 inline-block text-center">
                                    {line.type === "added" ? "+" : line.type === "removed" ? "-" : " "}
                                  </span>
                                  {line.content}
                                </span>
                              </div>
                            ))
                          )}
                        </div>
                      )}
                    </div>
                  </>
                ) : (
                  <div className="flex-1 flex items-center justify-center text-muted">
                    Select a file to view conflicts
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        {analysis && analysis.conflictingFiles.length > 0 && (
          <div className="px-6 py-3 border-t border-border bg-background-secondary flex items-center justify-between">
            <span className="text-xs text-muted">
              Branch: <code className="text-accent">{analysis.branchName}</code>
            </span>
            <div className="flex items-center gap-3">
              <button
                onClick={handleCancel}
                className="px-4 py-1.5 text-sm rounded-lg bg-muted/20 text-muted hover:text-foreground transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleMerge}
                disabled={!allResolved || merging}
                className="px-4 py-1.5 text-sm rounded-lg bg-success text-white hover:bg-success/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {merging ? "Merging..." : "Apply Resolutions & Merge"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
