import { useEffect, useRef } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { getCurrentWindow, LogicalSize, LogicalPosition } from '@tauri-apps/api/window'

interface WindowState {
  width: number
  height: number
  x?: number
  y?: number
  maximized: boolean
}

interface UiState {
  panelStates: Record<string, unknown>
  windowState?: WindowState
}

export function useWindowState() {
  const saveTimeoutRef = useRef<number | null>(null)
  const isRestoredRef = useRef(false)

  useEffect(() => {
    const appWindow = getCurrentWindow()

    // Restore window state on mount
    const restoreWindowState = async () => {
      if (isRestoredRef.current) return
      isRestoredRef.current = true

      try {
        const uiState = await invoke<UiState>('load_ui_state')
        const windowState = uiState.windowState

        if (windowState) {
          // Set size first
          if (windowState.width > 0 && windowState.height > 0) {
            await appWindow.setSize(new LogicalSize(windowState.width, windowState.height))
          }

          // Set position if available
          if (windowState.x !== undefined && windowState.y !== undefined) {
            await appWindow.setPosition(new LogicalPosition(windowState.x, windowState.y))
          }

          // Maximize if was maximized
          if (windowState.maximized) {
            await appWindow.maximize()
          }
        }
      } catch (e) {
        console.error('Failed to restore window state:', e)
      }
    }

    restoreWindowState()

    // Save window state on changes (debounced)
    const saveWindowState = async () => {
      try {
        const size = await appWindow.innerSize()
        const position = await appWindow.outerPosition()
        const maximized = await appWindow.isMaximized()

        const windowState: WindowState = {
          width: size.width,
          height: size.height,
          x: position.x,
          y: position.y,
          maximized,
        }

        await invoke('save_window_state', { windowState })
      } catch (e) {
        console.error('Failed to save window state:', e)
      }
    }

    const debouncedSave = () => {
      if (saveTimeoutRef.current !== null) {
        clearTimeout(saveTimeoutRef.current)
      }
      saveTimeoutRef.current = window.setTimeout(() => {
        saveWindowState()
        saveTimeoutRef.current = null
      }, 500)
    }

    // Listen for resize and move events
    const unlistenResize = appWindow.onResized(() => {
      debouncedSave()
    })

    const unlistenMove = appWindow.onMoved(() => {
      debouncedSave()
    })

    // Save on close
    const unlistenClose = appWindow.onCloseRequested(async () => {
      // Clear any pending debounce and save immediately
      if (saveTimeoutRef.current !== null) {
        clearTimeout(saveTimeoutRef.current)
      }
      await saveWindowState()
    })

    return () => {
      if (saveTimeoutRef.current !== null) {
        clearTimeout(saveTimeoutRef.current)
      }
      unlistenResize.then((fn) => fn())
      unlistenMove.then((fn) => fn())
      unlistenClose.then((fn) => fn())
    }
  }, [])
}
