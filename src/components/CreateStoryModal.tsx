import { useState, useEffect } from "react";
import type { Story } from "../stores/prdStore";

interface CreateStoryModalProps {
  isOpen: boolean;
  nextPriority: number;
  onClose: () => void;
  onSave: (story: Omit<Story, "id">) => void;
}

export function CreateStoryModal({
  isOpen,
  nextPriority,
  onClose,
  onSave,
}: CreateStoryModalProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [criteria, setCriteria] = useState<string[]>([""]);

  useEffect(() => {
    if (isOpen) {
      setTitle("");
      setDescription("");
      setCriteria([""]);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const nextId = `US-${String(nextPriority).padStart(3, "0")}`;

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  const handleSave = () => {
    onSave({
      title: title.trim(),
      description: description.trim(),
      acceptanceCriteria: criteria.filter((c) => c.trim() !== ""),
      priority: nextPriority,
      passes: false,
      notes: "",
    });
    onClose();
  };

  const handleCriterionChange = (index: number, value: string) => {
    const newCriteria = [...criteria];
    newCriteria[index] = value;
    setCriteria(newCriteria);
  };

  const handleDeleteCriterion = (index: number) => {
    setCriteria(criteria.filter((_, i) => i !== index));
  };

  const handleAddCriterion = () => {
    setCriteria([...criteria, ""]);
  };

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
      onClick={handleOverlayClick}
    >
      <div className="bg-card rounded-xl shadow-2xl w-full max-w-lg p-6 no-drag max-h-[90vh] overflow-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Create New Story</h2>
          <span className="px-2 py-0.5 text-xs font-medium bg-accent/10 text-accent rounded">
            {nextId}
          </span>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-secondary mb-1">
              Title
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Story title"
              className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground placeholder:text-secondary/60 focus:outline-none focus:ring-2 focus:ring-accent"
              autoFocus
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-secondary mb-1">
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="As a user, I want to..."
              rows={3}
              className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground placeholder:text-secondary/60 focus:outline-none focus:ring-2 focus:ring-accent resize-none"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium text-secondary">
                Acceptance Criteria
              </label>
              <button
                onClick={handleAddCriterion}
                className="text-xs text-accent hover:text-accent/80 font-medium transition-colors"
              >
                + Add Criterion
              </button>
            </div>
            <div className="space-y-2">
              {criteria.map((criterion, index) => (
                <div key={index} className="flex items-center gap-2">
                  <input
                    type="text"
                    value={criterion}
                    onChange={(e) => handleCriterionChange(index, e.target.value)}
                    placeholder={`Criterion ${index + 1}`}
                    className="flex-1 px-3 py-2 rounded-lg border border-border bg-background text-foreground placeholder:text-secondary/60 focus:outline-none focus:ring-2 focus:ring-accent text-sm"
                  />
                  <button
                    onClick={() => handleDeleteCriterion(index)}
                    className="p-2 rounded-lg hover:bg-red-500/10 text-secondary hover:text-red-500 transition-colors"
                    aria-label="Delete criterion"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M3 6h18" />
                      <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                      <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                    </svg>
                  </button>
                </div>
              ))}
              {criteria.length === 0 && (
                <p className="text-sm text-secondary/60 italic">
                  No acceptance criteria yet. Click "Add Criterion" to add one.
                </p>
              )}
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-3 mt-6">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-secondary hover:bg-border/50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!title.trim()}
            className="px-4 py-2 rounded-lg bg-accent text-white font-medium hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Create Story
          </button>
        </div>
      </div>
    </div>
  );
}
