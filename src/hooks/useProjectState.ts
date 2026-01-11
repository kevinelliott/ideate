import { useEffect, useRef } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { useBuildStore, type StoryBuildStatus } from '../stores/buildStore'

export interface ProjectState {
  currentStoryId: string | null
  storyStatuses: Record<string, string>
  storyRetries: Record<string, { retryCount: number }>
  buildPhase: string
}

export function useProjectState(projectPath: string | undefined) {
  const status = useBuildStore((state) => state.status)
  const currentStoryId = useBuildStore((state) => state.currentStoryId)
  const storyStatuses = useBuildStore((state) => state.storyStatuses)
  const storyRetries = useBuildStore((state) => state.storyRetries)
  const setCurrentStoryId = useBuildStore((state) => state.setCurrentStoryId)
  const setStoryStatus = useBuildStore((state) => state.setStoryStatus)
  const restoreRetryInfo = useBuildStore((state) => state.restoreRetryInfo)
  const resetBuildState = useBuildStore((state) => state.resetBuildState)

  const lastSavedRef = useRef<string>('')
  const hasLoadedRef = useRef<string>('')

  useEffect(() => {
    async function loadState() {
      if (!projectPath) {
        resetBuildState()
        return
      }

      if (hasLoadedRef.current === projectPath) {
        return
      }

      try {
        const state = await invoke<ProjectState | null>('load_project_state', {
          projectPath,
        })

        if (state) {
          if (state.currentStoryId) {
            setCurrentStoryId(state.currentStoryId)
          }

          Object.entries(state.storyStatuses).forEach(([storyId, status]) => {
            setStoryStatus(storyId, status as StoryBuildStatus)
          })

          Object.entries(state.storyRetries).forEach(([storyId, info]) => {
            restoreRetryInfo(storyId, info.retryCount)
          })
        }

        hasLoadedRef.current = projectPath
      } catch (error) {
        console.error('Failed to load project state:', error)
        hasLoadedRef.current = projectPath
      }
    }

    loadState()
  }, [projectPath, setCurrentStoryId, setStoryStatus, restoreRetryInfo, resetBuildState])

  useEffect(() => {
    async function saveState() {
      if (!projectPath || status === 'running') {
        return
      }

      const stateToSave: ProjectState = {
        currentStoryId,
        storyStatuses,
        storyRetries: Object.fromEntries(
          Object.entries(storyRetries).map(([id, info]) => [
            id,
            { retryCount: info.retryCount },
          ])
        ),
        buildPhase: status,
      }

      const stateKey = JSON.stringify(stateToSave)
      if (stateKey === lastSavedRef.current) {
        return
      }

      try {
        await invoke('save_project_state', {
          projectPath,
          state: stateToSave,
        })
        lastSavedRef.current = stateKey
      } catch (error) {
        console.error('Failed to save project state:', error)
      }
    }

    saveState()
  }, [projectPath, status, currentStoryId, storyStatuses, storyRetries])
}
