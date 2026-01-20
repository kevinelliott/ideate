import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useProjectStore } from "../stores/projectStore";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface DesignDocument {
  project: string;
  version?: string;
  generatedAt?: string;
  architecture?: {
    overview?: string;
    components?: Array<{
      name: string;
      description: string;
      responsibilities?: string[];
    }>;
    dataFlow?: string;
  };
  techStack?: {
    frontend?: string[];
    backend?: string[];
    database?: string[];
    infrastructure?: string[];
  };
  fileStructure?: string;
  apiDesign?: Array<{
    endpoint: string;
    method: string;
    description: string;
  }>;
  dataModels?: Array<{
    name: string;
    fields?: string[];
  }>;
  considerations?: {
    security?: string[];
    performance?: string[];
    scalability?: string[];
  };
}

interface SpecificationsContentProps {
  projectId: string;
}

export function SpecificationsContent({ projectId }: SpecificationsContentProps) {
  const project = useProjectStore((state) => 
    state.projects.find((p) => p.id === projectId)
  );
  
  const [design, setDesign] = useState<DesignDocument | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"architecture" | "tech" | "api" | "data" | "considerations">("architecture");

  useEffect(() => {
    if (!project?.path) return;

    const loadDesign = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const result = await invoke<DesignDocument | null>("load_design", {
          projectPath: project.path,
        });
        setDesign(result);
      } catch (err) {
        setError(String(err));
      } finally {
        setIsLoading(false);
      }
    };

    loadDesign();
  }, [project?.path]);

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
          <span className="text-sm text-muted">Loading specifications...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center max-w-md">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-destructive/10 flex items-center justify-center">
            <svg className="w-8 h-8 text-destructive" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h3 className="text-lg font-medium text-foreground mb-2">Failed to Load</h3>
          <p className="text-sm text-muted">{error}</p>
        </div>
      </div>
    );
  }

  if (!design) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center max-w-md">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-muted/10 flex items-center justify-center">
            <svg className="w-8 h-8 text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
            </svg>
          </div>
          <h3 className="text-lg font-medium text-foreground mb-2">No Specifications Yet</h3>
          <p className="text-sm text-muted mb-4">
            Generate specifications during project creation or from the wizard.
          </p>
        </div>
      </div>
    );
  }

  const tabs = [
    { id: "architecture", label: "Architecture", icon: "M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" },
    { id: "tech", label: "Tech Stack", icon: "M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" },
    { id: "api", label: "API Design", icon: "M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" },
    { id: "data", label: "Data Models", icon: "M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" },
    { id: "considerations", label: "Considerations", icon: "M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" },
  ] as const;

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-border bg-background-secondary">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold text-foreground">Specifications</h1>
            <p className="text-sm text-muted">
              Architecture and technical specifications for {project.name}
            </p>
          </div>
          {design.generatedAt && (
            <span className="text-xs text-muted">
              Generated: {new Date(design.generatedAt).toLocaleDateString()}
            </span>
          )}
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mt-4">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-colors ${
                activeTab === tab.id
                  ? "bg-accent text-white"
                  : "text-secondary hover:text-foreground hover:bg-card"
              }`}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={tab.icon} />
              </svg>
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {activeTab === "architecture" && (
          <div className="space-y-6">
            {design.architecture?.overview && (
              <section>
                <h2 className="text-sm font-medium text-secondary uppercase tracking-wider mb-3">
                  Overview
                </h2>
                <div className="prose prose-sm dark:prose-invert max-w-none">
                  <Markdown remarkPlugins={[remarkGfm]}>{design.architecture.overview}</Markdown>
                </div>
              </section>
            )}

            {design.architecture?.components && design.architecture.components.length > 0 && (
              <section>
                <h2 className="text-sm font-medium text-secondary uppercase tracking-wider mb-3">
                  Components
                </h2>
                <div className="grid gap-4">
                  {design.architecture.components.map((component, idx) => (
                    <div key={idx} className="p-4 bg-card rounded-lg border border-border">
                      <h3 className="font-medium text-foreground mb-2">{component.name}</h3>
                      <p className="text-sm text-secondary mb-3">{component.description}</p>
                      {component.responsibilities && component.responsibilities.length > 0 && (
                        <div>
                          <span className="text-xs text-muted uppercase tracking-wider">Responsibilities</span>
                          <ul className="mt-1 space-y-1">
                            {component.responsibilities.map((resp, i) => (
                              <li key={i} className="text-sm text-secondary flex items-start gap-2">
                                <span className="text-accent mt-1">•</span>
                                {resp}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            )}

            {design.architecture?.dataFlow && (
              <section>
                <h2 className="text-sm font-medium text-secondary uppercase tracking-wider mb-3">
                  Data Flow
                </h2>
                <div className="prose prose-sm dark:prose-invert max-w-none">
                  <Markdown remarkPlugins={[remarkGfm]}>{design.architecture.dataFlow}</Markdown>
                </div>
              </section>
            )}

            {design.fileStructure && (
              <section>
                <h2 className="text-sm font-medium text-secondary uppercase tracking-wider mb-3">
                  File Structure
                </h2>
                <pre className="p-4 bg-card rounded-lg border border-border overflow-x-auto text-sm text-secondary font-mono">
                  {design.fileStructure}
                </pre>
              </section>
            )}
          </div>
        )}

        {activeTab === "tech" && (
          <div className="grid gap-6 md:grid-cols-2">
            {design.techStack?.frontend && design.techStack.frontend.length > 0 && (
              <div className="p-4 bg-card rounded-lg border border-border">
                <h3 className="font-medium text-foreground mb-3 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-blue-500" />
                  Frontend
                </h3>
                <ul className="space-y-2">
                  {design.techStack.frontend.map((tech, i) => (
                    <li key={i} className="text-sm text-secondary">{tech}</li>
                  ))}
                </ul>
              </div>
            )}
            {design.techStack?.backend && design.techStack.backend.length > 0 && (
              <div className="p-4 bg-card rounded-lg border border-border">
                <h3 className="font-medium text-foreground mb-3 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-green-500" />
                  Backend
                </h3>
                <ul className="space-y-2">
                  {design.techStack.backend.map((tech, i) => (
                    <li key={i} className="text-sm text-secondary">{tech}</li>
                  ))}
                </ul>
              </div>
            )}
            {design.techStack?.database && design.techStack.database.length > 0 && (
              <div className="p-4 bg-card rounded-lg border border-border">
                <h3 className="font-medium text-foreground mb-3 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-purple-500" />
                  Database
                </h3>
                <ul className="space-y-2">
                  {design.techStack.database.map((tech, i) => (
                    <li key={i} className="text-sm text-secondary">{tech}</li>
                  ))}
                </ul>
              </div>
            )}
            {design.techStack?.infrastructure && design.techStack.infrastructure.length > 0 && (
              <div className="p-4 bg-card rounded-lg border border-border">
                <h3 className="font-medium text-foreground mb-3 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-orange-500" />
                  Infrastructure
                </h3>
                <ul className="space-y-2">
                  {design.techStack.infrastructure.map((tech, i) => (
                    <li key={i} className="text-sm text-secondary">{tech}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {activeTab === "api" && (
          <div className="space-y-4">
            {design.apiDesign && design.apiDesign.length > 0 ? (
              design.apiDesign.map((api, idx) => (
                <div key={idx} className="p-4 bg-card rounded-lg border border-border">
                  <div className="flex items-center gap-3 mb-2">
                    <span className={`px-2 py-0.5 rounded text-xs font-mono font-medium ${
                      api.method === "GET" ? "bg-green-500/10 text-green-500" :
                      api.method === "POST" ? "bg-blue-500/10 text-blue-500" :
                      api.method === "PUT" ? "bg-yellow-500/10 text-yellow-500" :
                      api.method === "DELETE" ? "bg-red-500/10 text-red-500" :
                      "bg-muted/10 text-muted"
                    }`}>
                      {api.method}
                    </span>
                    <code className="text-sm font-mono text-foreground">{api.endpoint}</code>
                  </div>
                  <p className="text-sm text-secondary">{api.description}</p>
                </div>
              ))
            ) : (
              <div className="text-center py-8 text-muted">
                No API endpoints defined
              </div>
            )}
          </div>
        )}

        {activeTab === "data" && (
          <div className="space-y-4">
            {design.dataModels && design.dataModels.length > 0 ? (
              design.dataModels.map((model, idx) => (
                <div key={idx} className="p-4 bg-card rounded-lg border border-border">
                  <h3 className="font-medium text-foreground mb-3">{model.name}</h3>
                  {model.fields && model.fields.length > 0 && (
                    <div className="space-y-1">
                      {model.fields.map((field, i) => (
                        <div key={i} className="text-sm text-secondary font-mono">
                          {field}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))
            ) : (
              <div className="text-center py-8 text-muted">
                No data models defined
              </div>
            )}
          </div>
        )}

        {activeTab === "considerations" && (
          <div className="grid gap-6 md:grid-cols-3">
            {design.considerations?.security && design.considerations.security.length > 0 && (
              <div className="p-4 bg-card rounded-lg border border-border">
                <h3 className="font-medium text-foreground mb-3 flex items-center gap-2">
                  <svg className="w-4 h-4 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                  Security
                </h3>
                <ul className="space-y-2">
                  {design.considerations.security.map((item, i) => (
                    <li key={i} className="text-sm text-secondary flex items-start gap-2">
                      <span className="text-red-500 mt-1">•</span>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {design.considerations?.performance && design.considerations.performance.length > 0 && (
              <div className="p-4 bg-card rounded-lg border border-border">
                <h3 className="font-medium text-foreground mb-3 flex items-center gap-2">
                  <svg className="w-4 h-4 text-yellow-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                  Performance
                </h3>
                <ul className="space-y-2">
                  {design.considerations.performance.map((item, i) => (
                    <li key={i} className="text-sm text-secondary flex items-start gap-2">
                      <span className="text-yellow-500 mt-1">•</span>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {design.considerations?.scalability && design.considerations.scalability.length > 0 && (
              <div className="p-4 bg-card rounded-lg border border-border">
                <h3 className="font-medium text-foreground mb-3 flex items-center gap-2">
                  <svg className="w-4 h-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
                  </svg>
                  Scalability
                </h3>
                <ul className="space-y-2">
                  {design.considerations.scalability.map((item, i) => (
                    <li key={i} className="text-sm text-secondary flex items-start gap-2">
                      <span className="text-green-500 mt-1">•</span>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
