import { useEffect, useState, useCallback } from "react";
import { listen, emit } from "@tauri-apps/api/event";
import { useThemeStore } from "../stores/themeStore";
import { useModalKeyboard } from "../hooks/useModalKeyboard";

type StoryStatus = "pending" | "in-progress" | "complete" | "failed";

interface Story {
  id: string;
  title: string;
  status: StoryStatus;
  passes: boolean;
}

interface StoryListSyncPayload {
  stories: Story[];
  projectId: string;
  projectName: string;
}

interface DeleteConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  count: number;
}

function DeleteConfirmModal({ isOpen, onClose, onConfirm, count }: DeleteConfirmModalProps) {
  useModalKeyboard(isOpen, onClose);
  
  if (!isOpen) return null;
  
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-card rounded-xl shadow-2xl w-full max-w-md p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 rounded-full bg-destructive/10">
            <svg className="w-6 h-6 text-destructive" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h2 className="text-lg font-semibold text-foreground">Delete Stories</h2>
        </div>
        <p className="text-secondary mb-6">
          Are you sure you want to delete {count} {count === 1 ? "story" : "stories"}? This action cannot be undone.
        </p>
        <div className="flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm rounded-lg bg-background-secondary text-foreground hover:bg-card transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => {
              onConfirm();
              onClose();
            }}
            className="px-4 py-2 text-sm rounded-lg bg-destructive text-white hover:bg-destructive/90 transition-colors"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

function getStatusColor(status: StoryStatus, passes: boolean): string {
  if (passes) return "text-success";
  switch (status) {
    case "complete":
      return "text-success";
    case "in-progress":
      return "text-accent";
    case "failed":
      return "text-destructive";
    default:
      return "text-muted";
  }
}

function getStatusBg(status: StoryStatus, passes: boolean): string {
  if (passes) return "bg-success/10";
  switch (status) {
    case "complete":
      return "bg-success/10";
    case "in-progress":
      return "bg-accent/10";
    case "failed":
      return "bg-destructive/10";
    default:
      return "bg-muted/10";
  }
}

function getStatusLabel(status: StoryStatus, passes: boolean): string {
  if (passes) return "Complete";
  switch (status) {
    case "complete":
      return "Complete";
    case "in-progress":
      return "In Progress";
    case "failed":
      return "Failed";
    default:
      return "Pending";
  }
}

export function StoryManagerWindow() {
  const loadTheme = useThemeStore((state) => state.loadTheme);
  const [stories, setStories] = useState<Story[]>([]);
  const [projectId, setProjectId] = useState<string | null>(() => {
    // Get projectId from URL query parameter
    const params = new URLSearchParams(window.location.search);
    return params.get('projectId');
  });
  const [projectName, setProjectName] = useState<string>("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [statusDropdownOpen, setStatusDropdownOpen] = useState(false);

  useEffect(() => {
    loadTheme();
  }, [loadTheme]);

  // Request current story list from main window on mount
  useEffect(() => {
    let retryTimeout: ReturnType<typeof setTimeout> | null = null;
    let receivedResponse = false;
    
    console.log('[StoryManager] Setting up listeners, projectId from URL:', projectId);
    
    const unlistenSyncPromise = listen<StoryListSyncPayload>("story-list-sync", (event) => {
      console.log('[StoryManager] story-list-sync received:', event.payload);
      const { stories: syncedStories, projectId: pid, projectName: pname } = event.payload;
      // Only accept sync for our project
      if (projectId && pid !== projectId) {
        console.log('[StoryManager] Ignoring sync for different project:', pid, 'vs', projectId);
        return;
      }
      receivedResponse = true;
      console.log('[StoryManager] Accepting sync, stories:', syncedStories.length, 'projectName:', pname);
      setStories(syncedStories);
      if (!projectId) setProjectId(pid);
      setProjectName(pname);
      // Clear selection when stories change
      setSelectedIds(new Set());
    });

    // Request story list for specific project with retry
    const requestStoryList = () => {
      console.log('[StoryManager] Emitting request-story-list for projectId:', projectId);
      emit("request-story-list", { projectId }).catch((err) => {
        console.error("[StoryManager] Failed to emit request-story-list:", err);
      });
    };
    
    // Initial request
    requestStoryList();
    
    // Retry after a short delay if no response (main window may still be loading)
    retryTimeout = setTimeout(() => {
      if (!receivedResponse) {
        console.log('[StoryManager] No response received, retrying request-story-list');
        requestStoryList();
      }
    }, 500);

    return () => {
      unlistenSyncPromise.then((unlisten) => unlisten());
      if (retryTimeout) clearTimeout(retryTimeout);
    };
  }, [projectId]);

  // Listen for story updates
  useEffect(() => {
    const unlistenUpdatePromise = listen<{ storyId: string; status?: StoryStatus; passes?: boolean }>(
      "story-status-update",
      (event) => {
        const { storyId, status, passes } = event.payload;
        setStories((prev) =>
          prev.map((s) =>
            s.id === storyId
              ? { ...s, status: status ?? s.status, passes: passes ?? s.passes }
              : s
          )
        );
      }
    );

    return () => {
      unlistenUpdatePromise.then((unlisten) => unlisten());
    };
  }, []);

  const handleSelectAll = useCallback(() => {
    if (selectedIds.size === stories.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(stories.map((s) => s.id)));
    }
  }, [stories, selectedIds]);

  const handleSelectOne = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const handleBulkStatusChange = useCallback(
    (newStatus: "complete" | "failed" | "pending") => {
      if (!projectId || selectedIds.size === 0) return;

      const passes = newStatus === "complete";
      const status: StoryStatus = newStatus === "complete" ? "complete" : newStatus === "failed" ? "failed" : "pending";

      // Emit event to main window to update stories
      emit("bulk-story-status-change", {
        projectId,
        storyIds: Array.from(selectedIds),
        status,
        passes,
      }).catch((err) => {
        console.error("[StoryManager] Failed to emit bulk status change:", err);
      });

      // Optimistically update local state
      setStories((prev) =>
        prev.map((s) =>
          selectedIds.has(s.id) ? { ...s, status, passes } : s
        )
      );
      setStatusDropdownOpen(false);
      setSelectedIds(new Set());
    },
    [projectId, selectedIds]
  );

  const handleBulkDelete = useCallback(() => {
    if (!projectId || selectedIds.size === 0) return;

    // Emit event to main window to delete stories
    emit("bulk-story-delete", {
      projectId,
      storyIds: Array.from(selectedIds),
    }).catch((err) => {
      console.error("[StoryManager] Failed to emit bulk delete:", err);
    });

    // Optimistically update local state
    setStories((prev) => prev.filter((s) => !selectedIds.has(s.id)));
    setSelectedIds(new Set());
  }, [projectId, selectedIds]);

  const allSelected = stories.length > 0 && selectedIds.size === stories.length;
  const someSelected = selectedIds.size > 0 && selectedIds.size < stories.length;

  return (
    <div className="flex flex-col h-screen bg-background text-foreground">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-foreground">Story Manager</h1>
          <p className="text-xs text-muted">
            {projectName || "No project selected"} • {stories.length} stories
          </p>
        </div>
        {selectedIds.size > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted">{selectedIds.size} selected</span>
            
            {/* Status dropdown */}
            <div className="relative">
              <button
                onClick={() => setStatusDropdownOpen(!statusDropdownOpen)}
                className="px-3 py-1.5 text-sm rounded-lg bg-accent text-white hover:bg-accent/90 transition-colors flex items-center gap-1"
              >
                Mark as Complete
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {statusDropdownOpen && (
                <>
                  <div 
                    className="fixed inset-0 z-10" 
                    onClick={() => setStatusDropdownOpen(false)} 
                  />
                  <div className="absolute right-0 mt-1 w-40 bg-card border border-border rounded-lg shadow-lg overflow-hidden z-20">
                    <button
                      onClick={() => handleBulkStatusChange("complete")}
                      className="w-full px-3 py-2 text-left text-sm text-foreground hover:bg-background-secondary flex items-center gap-2"
                    >
                      <span className="w-2 h-2 rounded-full bg-success" />
                      Complete
                    </button>
                    <button
                      onClick={() => handleBulkStatusChange("failed")}
                      className="w-full px-3 py-2 text-left text-sm text-foreground hover:bg-background-secondary flex items-center gap-2"
                    >
                      <span className="w-2 h-2 rounded-full bg-destructive" />
                      Failed
                    </button>
                    <button
                      onClick={() => handleBulkStatusChange("pending")}
                      className="w-full px-3 py-2 text-left text-sm text-foreground hover:bg-background-secondary flex items-center gap-2"
                    >
                      <span className="w-2 h-2 rounded-full bg-muted" />
                      Pending
                    </button>
                  </div>
                </>
              )}
            </div>

            {/* Delete button */}
            <button
              onClick={() => setShowDeleteModal(true)}
              className="px-3 py-1.5 text-sm rounded-lg bg-destructive/10 text-destructive hover:bg-destructive/20 transition-colors"
            >
              Delete
            </button>
          </div>
        )}
      </div>

      {/* Table */}
      <div className="flex-1 overflow-y-auto">
        {stories.length === 0 ? (
          <div className="flex items-center justify-center h-full text-muted">
            <div className="text-center">
              <svg className="w-12 h-12 mx-auto mb-2 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
              <p className="text-sm">No stories in this project</p>
              <p className="text-xs mt-1">Open a project with stories to manage them</p>
            </div>
          </div>
        ) : (
          <table className="w-full">
            <thead className="bg-background-secondary sticky top-0">
              <tr>
                <th className="w-10 px-4 py-2 text-left">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    ref={(el) => {
                      if (el) el.indeterminate = someSelected;
                    }}
                    onChange={handleSelectAll}
                    className="rounded border-border"
                  />
                </th>
                <th className="px-4 py-2 text-left text-xs font-medium text-muted uppercase tracking-wider">
                  ID
                </th>
                <th className="px-4 py-2 text-left text-xs font-medium text-muted uppercase tracking-wider">
                  Title
                </th>
                <th className="px-4 py-2 text-left text-xs font-medium text-muted uppercase tracking-wider">
                  Status
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {stories.map((story) => (
                <tr
                  key={story.id}
                  className={`hover:bg-background-secondary transition-colors ${
                    selectedIds.has(story.id) ? "bg-accent/5" : ""
                  }`}
                >
                  <td className="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(story.id)}
                      onChange={() => handleSelectOne(story.id)}
                      className="rounded border-border"
                    />
                  </td>
                  <td className="px-4 py-3">
                    <span className="font-mono text-sm text-accent">{story.id}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-sm text-foreground">{story.title}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${getStatusBg(story.status, story.passes)} ${getStatusColor(story.status, story.passes)}`}
                    >
                      {getStatusLabel(story.status, story.passes)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Delete confirmation modal */}
      <DeleteConfirmModal
        isOpen={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        onConfirm={handleBulkDelete}
        count={selectedIds.size}
      />
    </div>
  );
}
