import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useModalKeyboard } from "../hooks/useModalKeyboard";

interface WelcomeGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const STEPS = [
  {
    title: "Welcome to Ideate",
    description:
      "Ideate helps you build applications using AI coding agents. This guide will walk you through the basics.",
    icon: (
      <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
        />
      </svg>
    ),
  },
  {
    title: "Create or Import Projects",
    description:
      "Start a new project from scratch or import an existing codebase. Ideate will automatically generate user stories to guide AI agents.",
    icon: (
      <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
        />
      </svg>
    ),
  },
  {
    title: "Define Requirements",
    description:
      "Write user stories with acceptance criteria. The AI will use these to understand what to build and verify its work.",
    icon: (
      <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
        />
      </svg>
    ),
  },
  {
    title: "Run AI Agents",
    description:
      "Press play to start the build process. AI agents will work through each story, implementing features and fixing issues.",
    icon: (
      <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"
        />
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
        />
      </svg>
    ),
  },
  {
    title: "You're Ready!",
    description:
      "Create your first project to get started. You can always access this guide again from Help → Show Welcome Guide.",
    icon: (
      <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
        />
      </svg>
    ),
  },
];

export function WelcomeGuideModal({ isOpen, onClose }: WelcomeGuideModalProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [dontShowAgain, setDontShowAgain] = useState(false);

  useModalKeyboard(isOpen, onClose);

  useEffect(() => {
    if (isOpen) {
      setCurrentStep(0);
    }
  }, [isOpen]);

  const handleNext = () => {
    if (currentStep < STEPS.length - 1) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handlePrev = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleFinish = async () => {
    if (dontShowAgain) {
      try {
        const prefs = await invoke<Record<string, unknown> | null>("load_preferences");
        await invoke("save_preferences", {
          preferences: {
            ...prefs,
            hasSeenWelcomeGuide: true,
          },
        });
      } catch (error) {
        console.error("Failed to save preference:", error);
      }
    }
    onClose();
  };

  if (!isOpen) return null;

  const step = STEPS[currentStep];
  const isLastStep = currentStep === STEPS.length - 1;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-card rounded-xl shadow-2xl w-full max-w-lg overflow-hidden">
        <div className="p-8 flex flex-col items-center text-center">
          <div className="text-accent mb-6">{step.icon}</div>
          <h2 className="text-xl font-semibold mb-3">{step.title}</h2>
          <p className="text-secondary text-sm leading-relaxed max-w-sm">
            {step.description}
          </p>
        </div>

        <div className="flex justify-center gap-1.5 pb-4">
          {STEPS.map((_, index) => (
            <button
              key={index}
              onClick={() => setCurrentStep(index)}
              className={`w-2 h-2 rounded-full transition-colors ${
                index === currentStep ? "bg-accent" : "bg-border hover:bg-secondary"
              }`}
              aria-label={`Go to step ${index + 1}`}
            />
          ))}
        </div>

        {isLastStep && (
          <div className="px-8 pb-4">
            <label className="flex items-center gap-2 justify-center text-sm text-secondary cursor-pointer">
              <input
                type="checkbox"
                checked={dontShowAgain}
                onChange={(e) => setDontShowAgain(e.target.checked)}
                className="w-4 h-4 rounded border-border accent-accent"
              />
              <span>Don't show this again on startup</span>
            </label>
          </div>
        )}

        <div className="flex justify-between items-center px-6 py-4 border-t border-border bg-background-secondary">
          <button
            onClick={handlePrev}
            disabled={currentStep === 0}
            className="px-4 py-2 text-sm text-secondary hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            Previous
          </button>

          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm text-secondary hover:text-foreground transition-colors"
            >
              Skip
            </button>

            {isLastStep ? (
              <button
                onClick={handleFinish}
                className="px-4 py-2 text-sm bg-accent text-white rounded-lg font-medium hover:opacity-90 transition-opacity"
              >
                Get Started
              </button>
            ) : (
              <button
                onClick={handleNext}
                className="px-4 py-2 text-sm bg-accent text-white rounded-lg font-medium hover:opacity-90 transition-opacity"
              >
                Next
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
