import { useEffect, useRef, useState, useCallback } from "react";
import { useDevServer } from "../hooks/useDevServer";
import { useBuildStore } from "../stores/buildStore";
import { usePanelStore } from "../stores/panelStore";

interface PreviewPanelProps {
  projectId: string;
  projectPath: string;
}

const MIN_WIDTH = 200;
const MAX_WIDTH = 800;
const COLLAPSED_WIDTH = 36;

const ZOOM_PRESETS = [25, 50, 75, 100, 125, 150, 200];
const ZOOM_STEP = 10;
const MIN_ZOOM = 25;
const MAX_ZOOM = 200;
const DEFAULT_ZOOM = 100;

export function PreviewPanel({ projectId, projectPath }: PreviewPanelProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const panelState = usePanelStore((state) => state.getPanelState(projectId));
  const setPreviewPanelCollapsed = usePanelStore((state) => state.setPreviewPanelCollapsed);
  const setPreviewPanelWidth = usePanelStore((state) => state.setPreviewPanelWidth);

  const width = panelState.previewPanelWidth;
  const isCollapsed = panelState.previewPanelCollapsed;
  const setWidth = (w: number) => setPreviewPanelWidth(projectId, w);
  const setIsCollapsed = (c: boolean) => setPreviewPanelCollapsed(projectId, c);

  const [isResizing, setIsResizing] = useState(false);
  const [userStopped, setUserStopped] = useState(false);
  const [zoom, setZoom] = useState(DEFAULT_ZOOM);
  const [showZoomPresets, setShowZoomPresets] = useState(false);
  const [isIframeLoaded, setIsIframeLoaded] = useState(false);

  const startXRef = useRef(0);
  const startWidthRef = useRef(0);
  const lastCompletedCountRef = useRef(0);
  const zoomPresetsRef = useRef<HTMLDivElement>(null);

  const {
    status,
    config,
    url,
    error,
    detectDevServer,
    startServer,
    stopServer,
    toggleServer,
  } = useDevServer(projectPath, projectId);

  // Track build state to refresh preview after story completion
  const getProjectState = useBuildStore((state) => state.getProjectState);
  const buildState = getProjectState(projectId);
  
  // Count completed stories
  const completedCount = Object.values(buildState.storyStatuses).filter(
    (s) => s === 'complete'
  ).length;

  // Refresh preview when a story completes (if server is running and user hasn't stopped it)
  useEffect(() => {
    if (
      completedCount > lastCompletedCountRef.current &&
      status === 'running' &&
      !userStopped &&
      url &&
      iframeRef.current
    ) {
      // Small delay to let any file writes complete
      setIsIframeLoaded(false);
      setTimeout(() => {
        if (iframeRef.current && url) {
          iframeRef.current.src = url;
        }
      }, 1000);
    }
    lastCompletedCountRef.current = completedCount;
  }, [completedCount, status, userStopped, url]);

  // Auto-detect dev server when panel is expanded (and user hasn't stopped it)
  useEffect(() => {
    if (!isCollapsed && !config && status === 'idle' && !userStopped) {
      detectDevServer();
    }
  }, [isCollapsed, config, status, userStopped, detectDevServer]);

  // Auto-start server after detection (if user hasn't stopped it)
  useEffect(() => {
    if (config && status === 'idle' && !isCollapsed && !userStopped) {
      startServer();
    }
  }, [config, status, isCollapsed, userStopped, startServer]);

  // Reset iframe loaded state when URL changes
  useEffect(() => {
    setIsIframeLoaded(false);
  }, [url]);

  // Close zoom presets dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (zoomPresetsRef.current && !zoomPresetsRef.current.contains(e.target as Node)) {
        setShowZoomPresets(false);
      }
    };

    if (showZoomPresets) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showZoomPresets]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (isCollapsed) return;
    e.preventDefault();
    setIsResizing(true);
    startXRef.current = e.clientX;
    startWidthRef.current = width;
  }, [width, isCollapsed]);

  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      const deltaX = startXRef.current - e.clientX;
      const newWidth = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, startWidthRef.current + deltaX));
      setWidth(newWidth);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isResizing]);

  const toggleCollapse = () => {
    setIsCollapsed(!isCollapsed);
  };

  const handleRefresh = () => {
    if (iframeRef.current && url) {
      setIsIframeLoaded(false);
      iframeRef.current.src = url;
    }
  };

  const handleToggleServer = async () => {
    const isRunning = status === 'running' || status === 'starting';
    
    if (isRunning) {
      // User is stopping the server manually
      setUserStopped(true);
      await stopServer();
    } else {
      // User is starting the server
      setUserStopped(false);
      await toggleServer();
    }
  };

  const handleIframeLoad = () => {
    setIsIframeLoaded(true);
  };

  const handleZoomIn = () => {
    setZoom(prev => Math.min(MAX_ZOOM, prev + ZOOM_STEP));
  };

  const handleZoomOut = () => {
    setZoom(prev => Math.max(MIN_ZOOM, prev - ZOOM_STEP));
  };

  const handleZoomPreset = (preset: number) => {
    setZoom(preset);
    setShowZoomPresets(false);
  };

  const panelWidth = isCollapsed ? COLLAPSED_WIDTH : width;

  const isServerRunning = status === 'running' || status === 'starting';
  const isLoading = status === 'detecting' || status === 'starting';
  const canZoom = url && isIframeLoaded;

  const getStatusText = () => {
    switch (status) {
      case 'detecting': return 'Detecting dev server...';
      case 'starting': return 'Starting server...';
      case 'stopping': return 'Stopping server...';
      case 'running': return config?.command ? `${config.command} ${config.args.join(' ')}` : 'Server running';
      case 'error': return error || 'Error';
      default: return userStopped ? 'Server stopped by user' : 'Server stopped';
    }
  };

  // Calculate iframe scaling
  const scale = zoom / 100;
  const inverseScale = 100 / zoom;

  return (
    <div
      ref={containerRef}
      className="h-full flex flex-shrink-0 bg-background border-l border-border"
      style={{ width: panelWidth }}
    >
      {/* Resize handle */}
      <div
        onMouseDown={handleMouseDown}
        className={`w-1 h-full flex-shrink-0 ${
          isCollapsed
            ? 'cursor-default'
            : 'cursor-ew-resize hover:bg-accent/30 active:bg-accent/50'
        } ${isResizing ? 'bg-accent/50' : ''}`}
      />

      {isCollapsed ? (
        /* Collapsed state - vertical label */
        <button
          onClick={toggleCollapse}
          className="flex-1 flex flex-col items-center justify-center gap-2 hover:bg-card/50 transition-colors"
        >
          <svg
            className="w-3 h-3 text-muted rotate-180"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          <span
            className="text-xs font-medium text-muted uppercase tracking-wider"
            style={{ writingMode: 'vertical-rl', textOrientation: 'mixed' }}
          >
            Preview
          </span>
          {isServerRunning && (
            <span className="w-2 h-2 rounded-full bg-accent animate-pulse" />
          )}
        </button>
      ) : (
        /* Expanded state */
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-3 h-8 border-b border-border flex-shrink-0">
            <div className="flex items-center gap-2">
              <button
                onClick={toggleCollapse}
                className="flex items-center gap-2 hover:text-foreground transition-colors"
              >
                <svg
                  className="w-3 h-3 text-muted"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
                <span className="text-xs font-medium text-muted uppercase tracking-wider">Preview</span>
              </button>
              {isServerRunning && (
                <span className="w-2 h-2 rounded-full bg-accent animate-pulse" />
              )}
            </div>
            
            <div className="flex items-center gap-1">
              {/* Zoom controls */}
              <div className="flex items-center border border-border rounded overflow-hidden mr-1">
                <button
                  onClick={handleZoomOut}
                  disabled={!canZoom || zoom <= MIN_ZOOM}
                  className={`px-1.5 py-0.5 transition-colors ${
                    canZoom && zoom > MIN_ZOOM
                      ? 'text-muted hover:text-foreground hover:bg-card'
                      : 'text-muted/30 cursor-not-allowed'
                  }`}
                  title="Zoom out"
                >
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
                  </svg>
                </button>
                
                <div className="relative" ref={zoomPresetsRef}>
                  <button
                    onClick={() => canZoom && setShowZoomPresets(!showZoomPresets)}
                    disabled={!canZoom}
                    className={`px-2 py-0.5 text-xs font-medium min-w-[3rem] text-center border-x border-border transition-colors ${
                      canZoom
                        ? 'text-foreground hover:bg-card cursor-pointer'
                        : 'text-muted/50 cursor-not-allowed'
                    }`}
                    title="Select zoom level"
                  >
                    {zoom}%
                  </button>
                  
                  {showZoomPresets && (
                    <div className="absolute top-full left-1/2 -translate-x-1/2 mt-1 py-1 bg-card border border-border rounded-lg shadow-lg z-50 min-w-[4rem]">
                      {ZOOM_PRESETS.map((preset) => (
                        <button
                          key={preset}
                          onClick={() => handleZoomPreset(preset)}
                          className={`w-full px-3 py-1 text-xs text-left hover:bg-accent/10 transition-colors ${
                            zoom === preset ? 'text-accent font-medium' : 'text-foreground'
                          }`}
                        >
                          {preset}%
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                
                <button
                  onClick={handleZoomIn}
                  disabled={!canZoom || zoom >= MAX_ZOOM}
                  className={`px-1.5 py-0.5 transition-colors ${
                    canZoom && zoom < MAX_ZOOM
                      ? 'text-muted hover:text-foreground hover:bg-card'
                      : 'text-muted/30 cursor-not-allowed'
                  }`}
                  title="Zoom in"
                >
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                </button>
              </div>

              {/* Start/Stop button */}
              <button
                onClick={handleToggleServer}
                disabled={status === 'detecting' || status === 'stopping'}
                className={`p-1 rounded transition-colors flex items-center justify-center ${
                  status === 'detecting' || status === 'stopping'
                    ? 'text-muted/50 cursor-not-allowed'
                    : isServerRunning
                    ? 'text-destructive hover:bg-destructive/10'
                    : 'text-accent hover:bg-accent/10'
                }`}
                title={isServerRunning ? 'Stop server' : 'Start server'}
              >
                {isServerRunning ? (
                  // Stop icon
                  <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                    <rect x="6" y="6" width="12" height="12" rx="1" />
                  </svg>
                ) : (
                  // Play icon
                  <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                )}
              </button>

              {/* Refresh button */}
              <button
                onClick={handleRefresh}
                disabled={!url}
                className={`p-1 rounded transition-colors flex items-center justify-center ${
                  url
                    ? 'text-muted hover:text-foreground hover:bg-card'
                    : 'text-muted/50 cursor-not-allowed'
                }`}
                title="Refresh preview"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              </button>
            </div>
          </div>

          {/* Status bar */}
          <div className="px-3 py-1.5 text-xs text-muted border-b border-border bg-card/30 flex items-center gap-2 flex-shrink-0">
            {isLoading && (
              <svg className="w-3 h-3 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            )}
            <span className="truncate">{getStatusText()}</span>
            {url && status === 'running' && (
              <a 
                href={url} 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-accent hover:underline ml-auto flex-shrink-0"
              >
                {url}
              </a>
            )}
          </div>

          {/* Preview content */}
          <div className="flex-1 bg-white overflow-hidden">
            {status === 'error' ? (
              <div className="h-full flex items-center justify-center text-muted bg-background">
                <div className="flex flex-col items-center gap-3 px-4 text-center">
                  <svg className="w-8 h-8 text-destructive/50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  <span className="text-sm text-destructive">{error}</span>
                  <button
                    onClick={() => {
                      setUserStopped(false);
                      detectDevServer();
                    }}
                    className="btn btn-sm btn-secondary"
                  >
                    Retry Detection
                  </button>
                </div>
              </div>
            ) : isLoading ? (
              <div className="h-full flex items-center justify-center text-muted bg-background">
                <div className="flex flex-col items-center gap-3">
                  <svg className="w-6 h-6 animate-spin text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  <span className="text-sm">{getStatusText()}</span>
                </div>
              </div>
            ) : url ? (
              <div 
                className="w-full h-full overflow-auto"
                style={{
                  background: zoom !== 100 ? 'repeating-conic-gradient(#f0f0f0 0% 25%, #ffffff 0% 50%) 50% / 16px 16px' : 'white'
                }}
              >
                <iframe
                  ref={iframeRef}
                  src={url}
                  onLoad={handleIframeLoad}
                  className="border-none origin-top-left"
                  style={{
                    width: `${inverseScale * 100}%`,
                    height: `${inverseScale * 100}%`,
                    transform: `scale(${scale})`,
                  }}
                  title="Project Preview"
                />
              </div>
            ) : (
              <div className="h-full flex items-center justify-center text-muted bg-background">
                <div className="flex flex-col items-center gap-3 px-4 text-center">
                  <svg className="w-8 h-8 text-muted/50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                  <span className="text-sm">No preview available</span>
                  <button
                    onClick={() => {
                      setUserStopped(false);
                      toggleServer();
                    }}
                    className="btn btn-sm btn-primary"
                  >
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M8 5v14l11-7z" />
                    </svg>
                    Start Dev Server
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
