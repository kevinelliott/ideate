import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";

export type Theme = "system" | "light" | "dark";

interface ThemeState {
  theme: Theme;
  resolvedTheme: "light" | "dark";
  isLoaded: boolean;
  setTheme: (theme: Theme) => void;
  loadTheme: () => Promise<void>;
}

function getSystemTheme(): "light" | "dark" {
  if (typeof window !== "undefined" && window.matchMedia) {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  return "light";
}

function resolveTheme(theme: Theme): "light" | "dark" {
  if (theme === "system") {
    return getSystemTheme();
  }
  return theme;
}

function applyTheme(resolvedTheme: "light" | "dark") {
  const root = document.documentElement;
  root.classList.remove("light", "dark");
  root.classList.add(resolvedTheme);
}

export const useThemeStore = create<ThemeState>((set) => ({
  theme: "system",
  resolvedTheme: "light",
  isLoaded: false,

  setTheme: (theme: Theme) => {
    const resolvedTheme = resolveTheme(theme);
    applyTheme(resolvedTheme);
    set({ theme, resolvedTheme });
  },

  loadTheme: async () => {
    try {
      const preferences = await invoke<{ theme?: string }>("load_preferences");
      const theme = (preferences.theme as Theme) || "system";
      const resolvedTheme = resolveTheme(theme);
      applyTheme(resolvedTheme);
      set({ theme, resolvedTheme, isLoaded: true });
    } catch (err) {
      console.error("Failed to load theme preference:", err);
      const resolvedTheme = getSystemTheme();
      applyTheme(resolvedTheme);
      set({ theme: "system", resolvedTheme, isLoaded: true });
    }
  },
}));

if (typeof window !== "undefined" && window.matchMedia) {
  const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
  mediaQuery.addEventListener("change", () => {
    const state = useThemeStore.getState();
    if (state.theme === "system") {
      const resolvedTheme = getSystemTheme();
      applyTheme(resolvedTheme);
      useThemeStore.setState({ resolvedTheme });
    }
  });
}
