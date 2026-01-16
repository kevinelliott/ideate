import { useEffect, useRef } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { useBuildStore, type StoryBuildStatus } from '../stores/buildStore'
import { useProjectStore } from '../stores/projectStore'

export interface ProjectState {
  currentStoryId: string | null
  storyStatuses: Record<string, string>
  storyRetries: Record<string, { retryCount: number }>
  buildPhase: string
}

export function useProjectState(projectPath: string | undefined) {
  const activeProjectId = useProjectStore((state) => state.activeProjectId)
  const setCurrentStory = useBuildStore((state) => state.setCurrentStory)
  const setStoryStatus = useBuildStore((state) => state.setStoryStatus)
  const restoreRetryInfo = useBuildStore((state) => state.restoreRetryInfo)

  const lastSavedRef = useRef<string>('')
  const hasLoadedRef = useRef<string>('')

  useEffect(() => {
    async function loadState() {
      if (!projectPath || !activeProjectId) {
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
            setCurrentStory(activeProjectId, state.currentStoryId)
          }

          Object.entries(state.storyStatuses).forEach(([storyId, status]) => {
            setStoryStatus(activeProjectId, storyId, status as StoryBuildStatus)
          })

          Object.entries(state.storyRetries).forEach(([storyId, info]) => {
            restoreRetryInfo(activeProjectId, storyId, info.retryCount)
          })
        }

        hasLoadedRef.current = projectPath
      } catch (error) {
        console.error('Failed to load project state:', error)
        hasLoadedRef.current = projectPath
      }
    }

    loadState()
  }, [projectPath, activeProjectId, setCurrentStory, setStoryStatus, restoreRetryInfo])

  // Subscribe directly to the project state for reactivity
  const projectState = useBuildStore((state) => 
    activeProjectId ? state.projectStates[activeProjectId] : null
  )
  const storyStatuses = projectState?.storyStatuses
  const currentStoryId = projectState?.currentStoryId
  const buildStatus = projectState?.status
  const storyRetries = projectState?.storyRetries

  useEffect(() => {
    async function saveState() {
      if (!projectPath || !activeProjectId || !projectState) {
        return
      }

      // Don't save while running to avoid constant saves
      if (projectState.status === 'running') {
        return
      }

      const stateToSave: ProjectState = {
        currentStoryId: projectState.currentStoryId,
        storyStatuses: projectState.storyStatuses,
        storyRetries: Object.fromEntries(
          Object.entries(projectState.storyRetries).map(([id, info]) => [
            id,
            { retryCount: info.retryCount },
          ])
        ),
        buildPhase: projectState.status,
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
  }, [projectPath, activeProjectId, projectState, storyStatuses, currentStoryId, buildStatus, storyRetries])
}
