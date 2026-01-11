import { useCallback, useEffect, useRef } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { useBuildStore } from '../stores/buildStore'
import { usePrdStore } from '../stores/prdStore'
import { defaultPlugins } from '../types'
import type { AutonomyLevel } from '../components/AgentSettings'

interface SpawnAgentResult {
  process_id: string
}

interface WaitAgentResult {
  process_id: string
  exit_code: number | null
  success: boolean
}

interface ProjectSettings {
  agent: string | null
  autonomy: AutonomyLevel
}

export function useBuildLoop(projectPath: string | undefined) {
  const status = useBuildStore((state) => state.status)
  const currentStoryId = useBuildStore((state) => state.currentStoryId)
  const currentProcessId = useBuildStore((state) => state.currentProcessId)
  const startBuild = useBuildStore((state) => state.startBuild)
  const pauseBuild = useBuildStore((state) => state.pauseBuild)
  const cancelBuild = useBuildStore((state) => state.cancelBuild)
  const setCurrentStoryId = useBuildStore((state) => state.setCurrentStoryId)
  const setCurrentProcessId = useBuildStore((state) => state.setCurrentProcessId)
  const setStoryStatus = useBuildStore((state) => state.setStoryStatus)
  const appendLog = useBuildStore((state) => state.appendLog)
  const clearLogs = useBuildStore((state) => state.clearLogs)
  const resetStoryStatuses = useBuildStore((state) => state.resetStoryStatuses)

  const stories = usePrdStore((state) => state.stories)
  const updateStory = usePrdStore((state) => state.updateStory)
  const savePrd = usePrdStore((state) => state.savePrd)

  const isRunningRef = useRef(false)
  const storyIndexRef = useRef(0)

  const generatePrompt = useCallback((story: typeof stories[0]): string => {
    const criteria = story.acceptanceCriteria.map((c, i) => `${i + 1}. ${c}`).join('\n')
    return `Implement the following user story:

## ${story.id}: ${story.title}

${story.description}

### Acceptance Criteria:
${criteria}

${story.notes ? `### Notes:\n${story.notes}` : ''}

Please implement this user story following the acceptance criteria. When done, ensure all quality checks pass (typecheck, lint, build).`
  }, [])

  const runStory = useCallback(async (story: typeof stories[0]): Promise<boolean> => {
    if (!projectPath) return false

    setCurrentStoryId(story.id)
    setStoryStatus(story.id, 'in-progress')
    appendLog('system', `Starting story ${story.id}: ${story.title}`)

    try {
      const settings = await invoke<ProjectSettings | null>('load_project_settings', { projectPath })
      const agentId = settings?.agent || 'amp'

      const plugin = defaultPlugins.find((p) => p.id === agentId) || defaultPlugins[0]
      const prompt = generatePrompt(story)
      const args = plugin.argsTemplate.map((arg) =>
        arg.replace('{{prompt}}', prompt)
      )

      appendLog('system', `Spawning ${plugin.name} agent...`)

      const result = await invoke<SpawnAgentResult>('spawn_agent', {
        executable: plugin.command,
        args,
        workingDirectory: projectPath,
      })

      setCurrentProcessId(result.process_id)
      appendLog('system', `Agent process started (ID: ${result.process_id})`)

      const waitResult = await invoke<WaitAgentResult>('wait_agent', {
        processId: result.process_id,
      })

      setCurrentProcessId(null)

      if (waitResult.success) {
        appendLog('system', `✓ Story ${story.id} completed successfully (exit code: ${waitResult.exit_code})`)
        setStoryStatus(story.id, 'complete')
        updateStory(story.id, { passes: true })
        await savePrd(projectPath)
        return true
      } else {
        appendLog('system', `✗ Story ${story.id} failed (exit code: ${waitResult.exit_code})`)
        setStoryStatus(story.id, 'failed')
        return false
      }
    } catch (error) {
      appendLog('system', `✗ Error running story ${story.id}: ${error}`)
      setStoryStatus(story.id, 'failed')
      setCurrentProcessId(null)
      return false
    }
  }, [projectPath, generatePrompt, setCurrentStoryId, setCurrentProcessId, setStoryStatus, appendLog, updateStory, savePrd])

  const waitWhilePaused = useCallback(async (): Promise<boolean> => {
    while (useBuildStore.getState().status === 'paused') {
      await new Promise((resolve) => setTimeout(resolve, 500))
      if (useBuildStore.getState().status === 'idle') {
        return false
      }
    }
    return true
  }, [])

  const shouldPauseForAutonomy = useCallback((autonomy: AutonomyLevel, context: 'before' | 'after', hasMoreStories: boolean): boolean => {
    if (autonomy === 'manual') {
      return true
    }
    if (autonomy === 'pause-between' && context === 'after' && hasMoreStories) {
      return true
    }
    return false
  }, [])

  const runBuildLoop = useCallback(async () => {
    if (!projectPath || isRunningRef.current) return

    isRunningRef.current = true
    storyIndexRef.current = 0
    clearLogs()
    resetStoryStatuses()
    startBuild()
    appendLog('system', 'Build loop started')

    const incompleteStories = stories
      .filter((s) => !s.passes)
      .sort((a, b) => a.priority - b.priority)

    for (let i = 0; i < incompleteStories.length; i++) {
      const story = incompleteStories[i]
      storyIndexRef.current = i

      const buildStatus = useBuildStore.getState().status
      if (buildStatus === 'idle') {
        appendLog('system', 'Build cancelled')
        break
      }

      const settings = await invoke<ProjectSettings | null>('load_project_settings', { projectPath })
      const autonomy = settings?.autonomy || 'autonomous'

      if (i > 0 && shouldPauseForAutonomy(autonomy, 'before', true)) {
        setCurrentStoryId(story.id)
        setStoryStatus(story.id, 'pending')
        appendLog('system', `Pausing before story ${story.id} (${autonomy} mode) - Resume to continue`)
        pauseBuild()
        isRunningRef.current = false
        return
      }

      const shouldContinue = await waitWhilePaused()
      if (!shouldContinue) {
        appendLog('system', 'Build cancelled while paused')
        isRunningRef.current = false
        return
      }

      const success = await runStory(story)

      if (!success) {
        appendLog('system', 'Build paused due to story failure')
        pauseBuild()
        isRunningRef.current = false
        return
      }

      const remainingStories = usePrdStore.getState().stories.filter((s) => !s.passes)
      if (shouldPauseForAutonomy(autonomy, 'after', remainingStories.length > 0)) {
        if (autonomy === 'pause-between') {
          appendLog('system', 'Pausing for review (pause-between mode)')
          pauseBuild()
          isRunningRef.current = false
          return
        }
      }
    }

    const allComplete = usePrdStore.getState().stories.every((s) => s.passes)
    if (allComplete) {
      appendLog('system', '🎉 All stories completed successfully!')
    }

    setCurrentStoryId(null)
    cancelBuild()
    isRunningRef.current = false
  }, [projectPath, stories, runStory, clearLogs, resetStoryStatuses, startBuild, pauseBuild, cancelBuild, appendLog, waitWhilePaused, shouldPauseForAutonomy, setCurrentStoryId, setStoryStatus])

  const handleStart = useCallback(() => {
    runBuildLoop()
  }, [runBuildLoop])

  const handleResume = useCallback(() => {
    if (!projectPath || isRunningRef.current) return

    isRunningRef.current = true
    useBuildStore.getState().resumeBuild()
    appendLog('system', 'Build resumed')

    const runRemaining = async () => {
      const incompleteStories = usePrdStore.getState().stories
        .filter((s) => !s.passes)
        .sort((a, b) => a.priority - b.priority)

      for (let i = 0; i < incompleteStories.length; i++) {
        const story = incompleteStories[i]
        storyIndexRef.current = i

        const buildStatus = useBuildStore.getState().status
        if (buildStatus === 'idle') {
          appendLog('system', 'Build cancelled')
          break
        }

        const shouldContinue = await waitWhilePaused()
        if (!shouldContinue) {
          appendLog('system', 'Build cancelled while paused')
          isRunningRef.current = false
          return
        }

        const success = await runStory(story)

        if (!success) {
          appendLog('system', 'Build paused due to story failure')
          pauseBuild()
          isRunningRef.current = false
          return
        }

        const settings = await invoke<ProjectSettings | null>('load_project_settings', { projectPath })
        const autonomy = settings?.autonomy || 'autonomous'

        const remainingStories = usePrdStore.getState().stories.filter((s) => !s.passes)
        if (remainingStories.length > 0) {
          if (autonomy === 'manual' || autonomy === 'pause-between') {
            const nextStory = remainingStories[0]
            setCurrentStoryId(nextStory.id)
            setStoryStatus(nextStory.id, 'pending')
            appendLog('system', `Pausing ${autonomy === 'manual' ? 'before next story' : 'for review'} (${autonomy} mode)`)
            pauseBuild()
            isRunningRef.current = false
            return
          }
        }
      }

      const allComplete = usePrdStore.getState().stories.every((s) => s.passes)
      if (allComplete) {
        appendLog('system', '🎉 All stories completed successfully!')
      }

      setCurrentStoryId(null)
      cancelBuild()
      isRunningRef.current = false
    }

    runRemaining()
  }, [projectPath, runStory, pauseBuild, cancelBuild, appendLog, waitWhilePaused, setCurrentStoryId, setStoryStatus])

  const handleCancel = useCallback(async () => {
    const processId = useBuildStore.getState().currentProcessId
    if (processId) {
      try {
        await invoke('kill_agent', { processId })
        appendLog('system', 'Agent process terminated')
      } catch (error) {
        appendLog('system', `Failed to kill agent: ${error}`)
      }
    }
    setCurrentStoryId(null)
    cancelBuild()
    isRunningRef.current = false
    appendLog('system', 'Build cancelled by user')
  }, [cancelBuild, appendLog, setCurrentStoryId])

  useEffect(() => {
    return () => {
      isRunningRef.current = false
    }
  }, [])

  return {
    status,
    currentStoryId,
    currentProcessId,
    storyIndex: storyIndexRef.current,
    handleStart,
    handleResume,
    handleCancel,
  }
}
