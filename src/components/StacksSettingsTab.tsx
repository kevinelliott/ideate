import { useState } from "react";
import { useStacksStore, STACK_CATEGORIES, TOOL_CATEGORIES, type Stack, type StackTool } from "../stores/stacksStore";

interface StacksSettingsTabProps {
  onStacksChange?: () => void;
}

export function StacksSettingsTab({ onStacksChange }: StacksSettingsTabProps) {
  const stacks = useStacksStore((state) => state.stacks);
  const addStack = useStacksStore((state) => state.addStack);
  const updateStack = useStacksStore((state) => state.updateStack);
  const removeStack = useStacksStore((state) => state.removeStack);
  const duplicateStack = useStacksStore((state) => state.duplicateStack);
  
  const [selectedStackId, setSelectedStackId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [editingStack, setEditingStack] = useState<Partial<Stack> | null>(null);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set(["Web Application", "Full Stack Web"]));
  
  const selectedStack = selectedStackId ? stacks.find(s => s.id === selectedStackId) : null;

  const stacksByCategory = stacks.reduce((acc, stack) => {
    if (!acc[stack.category]) {
      acc[stack.category] = [];
    }
    acc[stack.category].push(stack);
    return acc;
  }, {} as Record<string, Stack[]>);

  const toggleCategory = (category: string) => {
    setExpandedCategories(prev => {
      const next = new Set(prev);
      if (next.has(category)) {
        next.delete(category);
      } else {
        next.add(category);
      }
      return next;
    });
  };

  const handleCreateStack = () => {
    setIsCreating(true);
    setEditingStack({
      name: "",
      description: "",
      category: "Web Application",
      tools: [],
      tags: [],
      icon: "📦",
    });
    setSelectedStackId(null);
  };

  const handleDuplicateStack = async (id: string) => {
    const newStack = await duplicateStack(id);
    if (newStack) {
      setSelectedStackId(newStack.id);
      onStacksChange?.();
    }
  };

  const handleDeleteStack = async (id: string) => {
    await removeStack(id);
    if (selectedStackId === id) {
      setSelectedStackId(null);
    }
    onStacksChange?.();
  };

  const handleSaveStack = async () => {
    if (!editingStack?.name?.trim()) return;
    
    if (isCreating) {
      const newStack = await addStack({
        name: editingStack.name,
        description: editingStack.description || "",
        category: editingStack.category || "Other",
        tools: editingStack.tools || [],
        tags: editingStack.tags || [],
        icon: editingStack.icon,
        author: "You",
      });
      setSelectedStackId(newStack.id);
    } else if (selectedStackId) {
      await updateStack(selectedStackId, {
        name: editingStack.name,
        description: editingStack.description,
        category: editingStack.category,
        tools: editingStack.tools,
        tags: editingStack.tags,
        icon: editingStack.icon,
      });
    }
    
    setIsCreating(false);
    setEditingStack(null);
    onStacksChange?.();
  };

  const handleCancelEdit = () => {
    setIsCreating(false);
    setEditingStack(null);
  };

  const handleEditStack = (stack: Stack) => {
    setEditingStack({ ...stack });
    setSelectedStackId(stack.id);
  };

  const handleAddTool = () => {
    if (!editingStack) return;
    const newTool: StackTool = {
      name: "",
      category: "Framework",
      description: "",
    };
    setEditingStack({
      ...editingStack,
      tools: [...(editingStack.tools || []), newTool],
    });
  };

  const handleUpdateTool = (index: number, updates: Partial<StackTool>) => {
    if (!editingStack?.tools) return;
    const newTools = [...editingStack.tools];
    newTools[index] = { ...newTools[index], ...updates };
    setEditingStack({ ...editingStack, tools: newTools });
  };

  const handleRemoveTool = (index: number) => {
    if (!editingStack?.tools) return;
    const newTools = editingStack.tools.filter((_, i) => i !== index);
    setEditingStack({ ...editingStack, tools: newTools });
  };

  const isEditing = isCreating || Boolean(editingStack && selectedStackId);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-medium text-secondary uppercase tracking-wider">
            Technology Stacks
          </h3>
          <p className="text-xs text-muted mt-1">
            Configure reusable tool combinations for your projects
          </p>
        </div>
        <button
          onClick={handleCreateStack}
          disabled={isEditing}
          className="px-3 py-1.5 text-sm rounded-lg bg-accent text-white hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          + New Stack
        </button>
      </div>

      <div className="flex gap-4 min-h-[400px]">
        {/* Stack List */}
        <div className="w-1/3 border border-border rounded-lg overflow-hidden">
          <div className="max-h-[380px] overflow-y-auto scrollbar-auto-hide">
            {Object.entries(stacksByCategory).map(([category, categoryStacks]) => (
              <div key={category}>
                <button
                  onClick={() => toggleCategory(category)}
                  className="w-full px-3 py-2 text-left text-xs font-medium text-secondary uppercase tracking-wider bg-card hover:bg-card/80 flex items-center justify-between"
                >
                  <span>{category}</span>
                  <svg
                    className={`w-4 h-4 transition-transform ${expandedCategories.has(category) ? 'rotate-180' : ''}`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                {expandedCategories.has(category) && (
                  <div className="divide-y divide-border">
                    {categoryStacks.map((stack) => (
                      <button
                        key={stack.id}
                        onClick={() => {
                          if (!isEditing) {
                            setSelectedStackId(stack.id);
                            setEditingStack(null);
                          }
                        }}
                        className={`w-full px-3 py-2 text-left flex items-center gap-2 hover:bg-card/50 transition-colors ${
                          selectedStackId === stack.id ? 'bg-accent/10 border-l-2 border-accent' : ''
                        } ${isEditing ? 'opacity-50 cursor-not-allowed' : ''}`}
                      >
                        <span className="text-lg">{stack.icon || '📦'}</span>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium truncate">{stack.name}</div>
                          <div className="text-xs text-muted truncate">{stack.tools.length} tools</div>
                        </div>
                        {stack.isBuiltin && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-accent/10 text-accent">
                            Built-in
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Stack Details / Editor */}
        <div className="flex-1 border border-border rounded-lg p-4 overflow-y-auto max-h-[380px] scrollbar-auto-hide">
          {isEditing && editingStack ? (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <input
                  type="text"
                  value={editingStack.icon || "📦"}
                  onChange={(e) => setEditingStack({ ...editingStack, icon: e.target.value.slice(0, 2) })}
                  className="w-12 h-12 text-2xl text-center bg-card border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-accent"
                  title="Stack icon (emoji)"
                />
                <div className="flex-1">
                  <input
                    type="text"
                    value={editingStack.name || ""}
                    onChange={(e) => setEditingStack({ ...editingStack, name: e.target.value })}
                    placeholder="Stack name"
                    className="w-full px-3 py-2 bg-card border border-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-accent"
                  />
                </div>
              </div>

              <textarea
                value={editingStack.description || ""}
                onChange={(e) => setEditingStack({ ...editingStack, description: e.target.value })}
                placeholder="Description of this stack..."
                rows={2}
                className="w-full px-3 py-2 bg-card border border-border rounded-lg text-foreground resize-none focus:outline-none focus:ring-2 focus:ring-accent"
              />

              <div>
                <label className="block text-xs text-secondary mb-1">Category</label>
                <select
                  value={editingStack.category || "Other"}
                  onChange={(e) => setEditingStack({ ...editingStack, category: e.target.value })}
                  className="w-full px-3 py-2 bg-card border border-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-accent"
                >
                  {STACK_CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs text-secondary">Tools</label>
                  <button
                    onClick={handleAddTool}
                    className="text-xs text-accent hover:underline"
                  >
                    + Add Tool
                  </button>
                </div>
                <div className="space-y-2">
                  {(editingStack.tools || []).map((tool, index) => (
                    <div key={index} className="flex items-start gap-2 p-2 bg-card rounded-lg border border-border">
                      <div className="flex-1 space-y-2">
                        <input
                          type="text"
                          value={tool.name}
                          onChange={(e) => handleUpdateTool(index, { name: e.target.value })}
                          placeholder="Tool name"
                          className="w-full px-2 py-1 text-sm bg-background border border-border rounded focus:outline-none focus:ring-1 focus:ring-accent"
                        />
                        <div className="flex gap-2">
                          <select
                            value={tool.category}
                            onChange={(e) => handleUpdateTool(index, { category: e.target.value })}
                            className="flex-1 px-2 py-1 text-xs bg-background border border-border rounded focus:outline-none"
                          >
                            {TOOL_CATEGORIES.map((cat) => (
                              <option key={cat} value={cat}>{cat}</option>
                            ))}
                          </select>
                          <input
                            type="text"
                            value={tool.version || ""}
                            onChange={(e) => handleUpdateTool(index, { version: e.target.value || undefined })}
                            placeholder="Version"
                            className="w-20 px-2 py-1 text-xs bg-background border border-border rounded focus:outline-none"
                          />
                        </div>
                      </div>
                      <button
                        onClick={() => handleRemoveTool(index)}
                        className="p-1 text-muted hover:text-destructive"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-border">
                <button
                  onClick={handleCancelEdit}
                  className="px-3 py-1.5 text-sm text-secondary hover:text-foreground"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveStack}
                  disabled={!editingStack.name?.trim()}
                  className="px-3 py-1.5 text-sm bg-accent text-white rounded-lg hover:opacity-90 disabled:opacity-50"
                >
                  {isCreating ? "Create Stack" : "Save Changes"}
                </button>
              </div>
            </div>
          ) : selectedStack ? (
            <div className="space-y-4">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-3xl">{selectedStack.icon || '📦'}</span>
                  <div>
                    <h4 className="text-lg font-semibold">{selectedStack.name}</h4>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-xs text-muted">{selectedStack.category}</span>
                      {selectedStack.isBuiltin && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-accent/10 text-accent">
                          Built-in
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex gap-1">
                  <button
                    onClick={() => handleDuplicateStack(selectedStack.id)}
                    className="p-2 text-muted hover:text-foreground hover:bg-card rounded-lg transition-colors"
                    title="Duplicate stack"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                  </button>
                  {!selectedStack.isBuiltin && (
                    <>
                      <button
                        onClick={() => handleEditStack(selectedStack)}
                        className="p-2 text-muted hover:text-foreground hover:bg-card rounded-lg transition-colors"
                        title="Edit stack"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                      </button>
                      <button
                        onClick={() => handleDeleteStack(selectedStack.id)}
                        className="p-2 text-muted hover:text-destructive hover:bg-destructive/10 rounded-lg transition-colors"
                        title="Delete stack"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </>
                  )}
                </div>
              </div>

              <p className="text-sm text-secondary">{selectedStack.description}</p>

              {selectedStack.tags.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {selectedStack.tags.map((tag) => (
                    <span key={tag} className="text-[10px] px-2 py-0.5 rounded-full bg-card text-muted">
                      {tag}
                    </span>
                  ))}
                </div>
              )}

              <div>
                <h5 className="text-xs font-medium text-secondary uppercase tracking-wider mb-2">
                  Included Tools ({selectedStack.tools.length})
                </h5>
                <div className="grid grid-cols-2 gap-2">
                  {selectedStack.tools.map((tool, index) => (
                    <div key={index} className="p-2 bg-card rounded-lg border border-border">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">{tool.name}</span>
                        {tool.version && (
                          <span className="text-[10px] text-muted">v{tool.version}</span>
                        )}
                      </div>
                      <span className="text-xs text-muted">{tool.category}</span>
                    </div>
                  ))}
                </div>
              </div>

              {selectedStack.author && (
                <p className="text-xs text-muted pt-2 border-t border-border">
                  By {selectedStack.author}
                </p>
              )}
            </div>
          ) : (
            <div className="h-full flex items-center justify-center text-muted text-sm">
              Select a stack to view details, or create a new one
            </div>
          )}
        </div>
      </div>

      <p className="text-xs text-muted">
        💡 Stacks can be applied to projects to guide AI agents during development. Coming soon: share your stacks on Ideate Cloud!
      </p>
    </div>
  );
}
