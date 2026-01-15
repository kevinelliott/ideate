import { useCallback } from 'react'
import { useThemeStore, type ColorMode, type ThemeId } from '../stores/themeStore'
import { getThemeList } from '../themes'

// Re-export types for convenience
export type { ThemeId, ColorMode }
export type Theme = ColorMode // Backward compatibility

export function useTheme() {
  const themeId = useThemeStore((state) => state.themeId)
  const colorMode = useThemeStore((state) => state.colorMode)
  const resolvedMode = useThemeStore((state) => state.resolvedMode)
  const setThemeId = useThemeStore((state) => state.setThemeId)
  const setColorMode = useThemeStore((state) => state.setColorMode)

  // Legacy compatibility: "theme" refers to colorMode
  const theme = colorMode
  const resolvedTheme = resolvedMode

  const setTheme = useCallback((mode: ColorMode) => {
    setColorMode(mode)
  }, [setColorMode])

  const toggleTheme = useCallback(() => {
    const currentMode = useThemeStore.getState().colorMode
    if (currentMode === 'light') {
      setColorMode('dark')
    } else if (currentMode === 'dark') {
      setColorMode('system')
    } else {
      setColorMode('light')
    }
  }, [setColorMode])

  const availableThemes = getThemeList()

  return {
    // New theme system
    themeId,
    colorMode,
    resolvedMode,
    setThemeId,
    setColorMode,
    availableThemes,
    
    // Legacy compatibility
    theme,
    resolvedTheme,
    setTheme,
    toggleTheme,
  }
}
