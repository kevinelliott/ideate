import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import { type ThemeId, type ColorMode, applyThemeToDocument } from "../themes";

interface ThemeState {
  themeId: ThemeId;
  colorMode: ColorMode;
  resolvedMode: "light" | "dark";
  isLoaded: boolean;
  setThemeId: (themeId: ThemeId) => void;
  setColorMode: (mode: ColorMode) => void;
  loadTheme: () => Promise<void>;
  saveTheme: () => Promise<void>;
}

function getSystemMode(): "light" | "dark" {
  if (typeof window !== "undefined" && window.matchMedia) {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  return "light";
}

function resolveMode(mode: ColorMode): "light" | "dark" {
  if (mode === "system") {
    return getSystemMode();
  }
  return mode;
}

export const useThemeStore = create<ThemeState>((set, get) => ({
  themeId: "ideate",
  colorMode: "system",
  resolvedMode: "light",
  isLoaded: false,

  setThemeId: (themeId: ThemeId) => {
    const state = get();
    const resolvedMode = resolveMode(state.colorMode);
    applyThemeToDocument(themeId, resolvedMode);
    set({ themeId });
    // Save after state update
    setTimeout(() => get().saveTheme(), 0);
  },

  setColorMode: (colorMode: ColorMode) => {
    const state = get();
    const resolvedMode = resolveMode(colorMode);
    applyThemeToDocument(state.themeId, resolvedMode);
    set({ colorMode, resolvedMode });
    // Save after state update
    setTimeout(() => get().saveTheme(), 0);
  },

  loadTheme: async () => {
    try {
      const preferences = await invoke<{ 
        theme?: string; 
        themeId?: string;
        colorMode?: string;
      }>("load_preferences");
      
      // Support both old "theme" field and new "themeId" + "colorMode" fields
      const themeId = (preferences.themeId as ThemeId) || "ideate";
      const colorMode = (preferences.colorMode as ColorMode) || 
                        (preferences.theme as ColorMode) || 
                        "system";
      const resolvedMode = resolveMode(colorMode);
      
      applyThemeToDocument(themeId, resolvedMode);
      set({ themeId, colorMode, resolvedMode, isLoaded: true });
    } catch (err) {
      console.error("Failed to load theme preference:", err);
      const resolvedMode = getSystemMode();
      applyThemeToDocument("ideate", resolvedMode);
      set({ themeId: "ideate", colorMode: "system", resolvedMode, isLoaded: true });
    }
  },

  saveTheme: async () => {
    const { themeId, colorMode } = get();
    try {
      // Load current preferences and merge
      const currentPrefs = await invoke<Record<string, unknown>>("load_preferences");
      await invoke("save_preferences", {
        preferences: {
          ...currentPrefs,
          themeId,
          colorMode,
          // Keep backward compatibility with old theme field
          theme: colorMode,
        },
      });
    } catch (err) {
      console.error("Failed to save theme preference:", err);
    }
  },
}));

// Listen for system color scheme changes
if (typeof window !== "undefined" && window.matchMedia) {
  const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
  mediaQuery.addEventListener("change", () => {
    const state = useThemeStore.getState();
    if (state.colorMode === "system") {
      const resolvedMode = getSystemMode();
      applyThemeToDocument(state.themeId, resolvedMode);
      useThemeStore.setState({ resolvedMode });
    }
  });
}

// ============================================================================
// Deprecated exports for backward compatibility
// These map the old Theme type to the new ColorMode type
// ============================================================================

export type Theme = ColorMode;

// Legacy hook compatibility
export { type ThemeId, type ColorMode };
