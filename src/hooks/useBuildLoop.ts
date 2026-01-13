import { useCallback, useEffect, useRef } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { useBuildStore } from '../stores/buildStore'
import { usePrdStore } from '../stores/prdStore'
import { useCostStore } from '../stores/costStore'
import { useProcessStore } from '../stores/processStore'
import { defaultPlugins } from '../types'
import { usePromptStore } from '../stores/promptStore'
import type { AutonomyLevel, BuildMode } from '../components/ProjectTopBar'

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
  build_mode: BuildMode | null
}

const DEFAULT_PARALLEL_LIMIT = 3

export function useBuildLoop(projectId: string | undefined, projectPath: string | undefined) {
  const getProjectState = useBuildStore((state) => state.getProjectState)
  const startBuild = useBuildStore((state) => state.startBuild)
  const pauseBuild = useBuildStore((state) => state.pauseBuild)
  const cancelBuild = useBuildStore((state) => state.cancelBuild)
  const setCurrentStory = useBuildStore((state) => state.setCurrentStory)
  const setCurrentProcessId = useBuildStore((state) => state.setCurrentProcessId)
  const setStoryStatus = useBuildStore((state) => state.setStoryStatus)
  const appendLog = useBuildStore((state) => state.appendLog)
  const clearLogs = useBuildStore((state) => state.clearLogs)
  const resetStoryStatuses = useBuildStore((state) => state.resetStoryStatuses)

  const stories = usePrdStore((state) => state.stories)
  const updateStory = usePrdStore((state) => state.updateStory)
  const savePrd = usePrdStore((state) => state.savePrd)

  const parseAndAddFromOutput = useCostStore((state) => state.parseAndAddFromOutput)
  const getPrompt = usePromptStore((state) => state.getPrompt)

  const registerProcess = useProcessStore((state) => state.registerProcess)
  const unregisterProcess = useProcessStore((state) => state.unregisterProcess)

  const isRunningRef = useRef(false)
  const storyIndexRef = useRef(0)
  const activeProcessesRef = useRef<Map<string, string>>(new Map())

  const projectState = projectId ? getProjectState(projectId) : null
  const status = projectState?.status || 'idle'
  const currentStoryId = projectState?.currentStoryId || null
  const currentProcessId = projectState?.currentProcessId || null

  const generatePrompt = useCallback((story: typeof stories[0]): string => {
    const criteria = story.acceptanceCriteria.map((c, i) => `${i + 1}. ${c}`).join('\n')
    const notesSection = story.notes ? `### Notes:\n${story.notes}` : ''
    
    return getPrompt('storyImplementation', {
      '{{storyId}}': story.id,
      '{{storyTitle}}': story.title,
      '{{storyDescription}}': story.description,
      '{{acceptanceCriteria}}': criteria,
      '{{notes}}': notesSection,
    })
  }, [getPrompt])

  const runStory = useCallback(async (story: typeof stories[0]): Promise<boolean> => {
    if (!projectPath || !projectId) return false

    setCurrentStory(projectId, story.id, story.title)
    setStoryStatus(projectId, story.id, 'in-progress')
    appendLog(projectId, 'system', `Starting story ${story.id}: ${story.title}`)

    try {
      const settings = await invoke<ProjectSettings | null>('load_project_settings', { projectPath })
      const agentId = settings?.agent || 'amp'

      const plugin = defaultPlugins.find((p) => p.id === agentId) || defaultPlugins[0]
      const prompt = generatePrompt(story)
      const args = plugin.argsTemplate.map((arg) =>
        arg.replace('{{prompt}}', prompt)
      )

      appendLog(projectId, 'system', `Spawning ${plugin.name} agent...`)

      const startTime = Date.now()

      const result = await invoke<SpawnAgentResult>('spawn_agent', {
        executable: plugin.command,
        args,
        workingDirectory: projectPath,
      })

      setCurrentProcessId(projectId, result.process_id)
      appendLog(projectId, 'system', `Agent process started (ID: ${result.process_id})`)

      registerProcess({
        processId: result.process_id,
        projectId,
        type: 'build',
        label: story.title,
        agentId,
        command: {
          executable: plugin.command,
          args,
          workingDirectory: projectPath,
        },
      })

      const waitResult = await invoke<WaitAgentResult>('wait_agent', {
        processId: result.process_id,
      })

      const durationMs = Date.now() - startTime

      unregisterProcess(result.process_id)
      setCurrentProcessId(projectId, null)

      const logs = useBuildStore.getState().getProjectState(projectId).logs
      const recentLogs = logs.slice(-50).map(l => l.content).join('\n')
      parseAndAddFromOutput(projectId, projectPath, agentId, `Story: ${story.title}`, recentLogs, durationMs)

      if (waitResult.success) {
        appendLog(projectId, 'system', `✓ Story ${story.id} completed successfully (exit code: ${waitResult.exit_code})`)
        setStoryStatus(projectId, story.id, 'complete')
        updateStory(story.id, { passes: true })
        await savePrd(projectPath)
        return true
      } else {
        appendLog(projectId, 'system', `✗ Story ${story.id} failed (exit code: ${waitResult.exit_code})`)
        setStoryStatus(projectId, story.id, 'failed')
        return false
      }
    } catch (error) {
      appendLog(projectId, 'system', `✗ Error running story ${story.id}: ${error}`)
      setStoryStatus(projectId, story.id, 'failed')
      setCurrentProcessId(projectId, null)
      return false
    }
  }, [projectPath, projectId, generatePrompt, setCurrentStory, setCurrentProcessId, setStoryStatus, appendLog, updateStory, savePrd, parseAndAddFromOutput, registerProcess, unregisterProcess])

  const runStoryParallel = useCallback(async (story: typeof stories[0]): Promise<boolean> => {
    if (!projectPath || !projectId) return false

    setStoryStatus(projectId, story.id, 'in-progress')
    appendLog(projectId, 'system', `[Parallel] Starting story ${story.id}: ${story.title}`)

    try {
      const settings = await invoke<ProjectSettings | null>('load_project_settings', { projectPath })
      const agentId = settings?.agent || 'amp'

      const plugin = defaultPlugins.find((p) => p.id === agentId) || defaultPlugins[0]
      const prompt = generatePrompt(story)
      const args = plugin.argsTemplate.map((arg) =>
        arg.replace('{{prompt}}', prompt)
      )

      const startTime = Date.now()

      const result = await invoke<SpawnAgentResult>('spawn_agent', {
        executable: plugin.command,
        args,
        workingDirectory: projectPath,
      })

      activeProcessesRef.current.set(story.id, result.process_id)
      appendLog(projectId, 'system', `[Parallel] Agent started for ${story.id} (PID: ${result.process_id})`)

      registerProcess({
        processId: result.process_id,
        projectId,
        type: 'build',
        label: `[P] ${story.title}`,
        agentId,
        command: {
          executable: plugin.command,
          args,
          workingDirectory: projectPath,
        },
      })

      const waitResult = await invoke<WaitAgentResult>('wait_agent', {
        processId: result.process_id,
      })

      const durationMs = Date.now() - startTime

      unregisterProcess(result.process_id)
      activeProcessesRef.current.delete(story.id)

      const logs = useBuildStore.getState().getProjectState(projectId).logs
      const recentLogs = logs.slice(-50).map(l => l.content).join('\n')
      parseAndAddFromOutput(projectId, projectPath, agentId, `Story: ${story.title}`, recentLogs, durationMs)

      if (waitResult.success) {
        appendLog(projectId, 'system', `✓ [Parallel] Story ${story.id} completed successfully`)
        setStoryStatus(projectId, story.id, 'complete')
        updateStory(story.id, { passes: true })
        await savePrd(projectPath)
        return true
      } else {
        appendLog(projectId, 'system', `✗ [Parallel] Story ${story.id} failed (exit code: ${waitResult.exit_code})`)
        setStoryStatus(projectId, story.id, 'failed')
        return false
      }
    } catch (error) {
      appendLog(projectId, 'system', `✗ [Parallel] Error running story ${story.id}: ${error}`)
      setStoryStatus(projectId, story.id, 'failed')
      activeProcessesRef.current.delete(story.id)
      return false
    }
  }, [projectPath, projectId, generatePrompt, setStoryStatus, appendLog, updateStory, savePrd, parseAndAddFromOutput, registerProcess, unregisterProcess])

  const runParallelBuildLoop = useCallback(async () => {
    if (!projectPath || !projectId || isRunningRef.current) return

    isRunningRef.current = true
    clearLogs(projectId)
    resetStoryStatuses(projectId)
    startBuild(projectId)
    appendLog(projectId, 'system', '🚀 Parallel build started')

    const incompleteStories = stories
      .filter((s) => !s.passes)
      .sort((a, b) => a.priority - b.priority)

    if (incompleteStories.length === 0) {
      appendLog(projectId, 'system', 'No stories to build')
      cancelBuild(projectId)
      isRunningRef.current = false
      return
    }

    appendLog(projectId, 'system', `Running ${incompleteStories.length} stories with up to ${DEFAULT_PARALLEL_LIMIT} concurrent agents`)

    const runBatch = async (storiesToRun: typeof stories) => {
      const promises = storiesToRun.map(story => runStoryParallel(story))
      const results = await Promise.all(promises)
      return results
    }

    let storyQueue = [...incompleteStories]
    let hasFailures = false

    while (storyQueue.length > 0) {
      const buildStatus = useBuildStore.getState().getProjectState(projectId).status
      if (buildStatus === 'idle') {
        appendLog(projectId, 'system', 'Build cancelled')
        break
      }

      if (buildStatus === 'paused') {
        appendLog(projectId, 'system', 'Build paused - waiting to resume...')
        while (useBuildStore.getState().getProjectState(projectId).status === 'paused') {
          await new Promise(resolve => setTimeout(resolve, 500))
          if (useBuildStore.getState().getProjectState(projectId).status === 'idle') {
            appendLog(projectId, 'system', 'Build cancelled while paused')
            isRunningRef.current = false
            return
          }
        }
        appendLog(projectId, 'system', 'Build resumed')
      }

      const batch = storyQueue.splice(0, DEFAULT_PARALLEL_LIMIT)
      appendLog(projectId, 'system', `Starting batch of ${batch.length} stories`)

      const results = await runBatch(batch)
      const failedCount = results.filter(r => !r).length

      if (failedCount > 0) {
        hasFailures = true
        appendLog(projectId, 'system', `${failedCount} stories failed in this batch`)
      }
    }

    if (hasFailures) {
      appendLog(projectId, 'system', '⚠️ Build completed with some failures')
    }

    const allComplete = usePrdStore.getState().stories.every((s) => s.passes)
    if (allComplete) {
      appendLog(projectId, 'system', '🎉 All stories completed successfully!')
    }

    setCurrentStory(projectId, null)
    cancelBuild(projectId)
    isRunningRef.current = false
  }, [projectPath, projectId, stories, runStoryParallel, clearLogs, resetStoryStatuses, startBuild, cancelBuild, appendLog, setCurrentStory])

  const waitWhilePaused = useCallback(async (): Promise<boolean> => {
    if (!projectId) return false
    
    while (true) {
      const buildStatus = useBuildStore.getState().getProjectState(projectId).status
      if (buildStatus === 'idle') return false
      if (buildStatus === 'running') return true
      await new Promise(resolve => setTimeout(resolve, 500))
    }
  }, [projectId])

  const shouldPauseForAutonomy = useCallback((autonomy: AutonomyLevel, timing: 'before' | 'after', hasRemaining: boolean): boolean => {
    if (autonomy === 'autonomous') return false
    if (autonomy === 'manual' && timing === 'before') return true
    if (autonomy === 'pause-between' && timing === 'after' && hasRemaining) return true
    return false
  }, [])

  const runFromStory = useCallback(async (storyId: string) => {
    if (!projectPath || !projectId || isRunningRef.current) return

    isRunningRef.current = true
    clearLogs(projectId)
    resetStoryStatuses(projectId)
    startBuild(projectId)
    appendLog(projectId, 'system', `Build started from story ${storyId}`)

    const allStories = usePrdStore.getState().stories
      .sort((a, b) => a.priority - b.priority)
    
    const startIndex = allStories.findIndex(s => s.id === storyId)
    if (startIndex === -1) {
      appendLog(projectId, 'system', `Story ${storyId} not found`)
      cancelBuild(projectId)
      isRunningRef.current = false
      return
    }

    const storiesToRun = allStories.slice(startIndex).filter(s => !s.passes)

    for (let i = 0; i < storiesToRun.length; i++) {
      const story = storiesToRun[i]
      storyIndexRef.current = i

      const buildStatus = useBuildStore.getState().getProjectState(projectId).status
      if (buildStatus === 'idle') {
        appendLog(projectId, 'system', 'Build cancelled')
        break
      }

      const shouldContinue = await waitWhilePaused()
      if (!shouldContinue) {
        appendLog(projectId, 'system', 'Build cancelled while paused')
        isRunningRef.current = false
        return
      }

      const success = await runStory(story)

      if (!success) {
        appendLog(projectId, 'system', 'Build paused due to story failure')
        pauseBuild(projectId)
        isRunningRef.current = false
        return
      }

      const settings = await invoke<ProjectSettings | null>('load_project_settings', { projectPath })
      const autonomy = settings?.autonomy || 'autonomous'

      const remainingStories = usePrdStore.getState().stories.filter((s) => !s.passes)
      if (remainingStories.length > 0) {
        if (autonomy === 'manual' || autonomy === 'pause-between') {
          const nextStory = remainingStories[0]
          setCurrentStory(projectId, nextStory.id, nextStory.title)
          setStoryStatus(projectId, nextStory.id, 'pending')
          appendLog(projectId, 'system', `Pausing ${autonomy === 'manual' ? 'before next story' : 'for review'} (${autonomy} mode)`)
          pauseBuild(projectId)
          isRunningRef.current = false
          return
        }
      }
    }

    const allComplete = usePrdStore.getState().stories.every((s) => s.passes)
    if (allComplete) {
      appendLog(projectId, 'system', '🎉 All stories completed successfully!')
    }

    setCurrentStory(projectId, null)
    cancelBuild(projectId)
    isRunningRef.current = false
  }, [projectPath, projectId, runStory, startBuild, pauseBuild, cancelBuild, appendLog, waitWhilePaused, setCurrentStory, setStoryStatus, stories, clearLogs, resetStoryStatuses])

  const runBuildLoop = useCallback(async () => {
    if (!projectPath || !projectId || isRunningRef.current) return

    const settings = await invoke<ProjectSettings | null>('load_project_settings', { projectPath })
    const buildMode = settings?.build_mode || 'ralph'

    if (buildMode === 'none') {
      appendLog(projectId, 'system', 'Build mode is set to "None" - no automatic building')
      return
    }

    if (buildMode === 'parallel') {
      return runParallelBuildLoop()
    }

    isRunningRef.current = true
    storyIndexRef.current = 0
    clearLogs(projectId)
    resetStoryStatuses(projectId)
    startBuild(projectId)
    appendLog(projectId, 'system', 'Build loop started (Ralph mode)')

    const incompleteStories = stories
      .filter((s) => !s.passes)
      .sort((a, b) => a.priority - b.priority)

    for (let i = 0; i < incompleteStories.length; i++) {
      const story = incompleteStories[i]
      storyIndexRef.current = i

      const buildStatus = useBuildStore.getState().getProjectState(projectId).status
      if (buildStatus === 'idle') {
        appendLog(projectId, 'system', 'Build cancelled')
        break
      }

      const currentSettings = await invoke<ProjectSettings | null>('load_project_settings', { projectPath })
      const autonomy = currentSettings?.autonomy || 'autonomous'

      if (i > 0 && shouldPauseForAutonomy(autonomy, 'before', true)) {
        setCurrentStory(projectId, story.id, story.title)
        setStoryStatus(projectId, story.id, 'pending')
        appendLog(projectId, 'system', `Pausing before story ${story.id} (${autonomy} mode) - Resume to continue`)
        pauseBuild(projectId)
        isRunningRef.current = false
        return
      }

      const shouldContinue = await waitWhilePaused()
      if (!shouldContinue) {
        appendLog(projectId, 'system', 'Build cancelled while paused')
        isRunningRef.current = false
        return
      }

      const success = await runStory(story)

      if (!success) {
        appendLog(projectId, 'system', 'Build paused due to story failure')
        pauseBuild(projectId)
        isRunningRef.current = false
        return
      }

      const remainingStories = usePrdStore.getState().stories.filter((s) => !s.passes)
      if (shouldPauseForAutonomy(autonomy, 'after', remainingStories.length > 0)) {
        if (autonomy === 'pause-between') {
          appendLog(projectId, 'system', 'Pausing for review (pause-between mode)')
          pauseBuild(projectId)
          isRunningRef.current = false
          return
        }
      }
    }

    const allComplete = usePrdStore.getState().stories.every((s) => s.passes)
    if (allComplete) {
      appendLog(projectId, 'system', '🎉 All stories completed successfully!')
    }

    setCurrentStory(projectId, null)
    cancelBuild(projectId)
    isRunningRef.current = false
  }, [projectPath, projectId, stories, runStory, runParallelBuildLoop, clearLogs, resetStoryStatuses, startBuild, pauseBuild, cancelBuild, appendLog, waitWhilePaused, shouldPauseForAutonomy, setCurrentStory, setStoryStatus])

  const handleStart = useCallback(() => {
    runBuildLoop()
  }, [runBuildLoop])

  const handleResume = useCallback(() => {
    if (!projectPath || !projectId || isRunningRef.current) return

    isRunningRef.current = true
    useBuildStore.getState().resumeBuild(projectId)
    appendLog(projectId, 'system', 'Build resumed')

    const runRemaining = async () => {
      const incompleteStories = usePrdStore.getState().stories
        .filter((s) => !s.passes)
        .sort((a, b) => a.priority - b.priority)

      for (let i = 0; i < incompleteStories.length; i++) {
        const story = incompleteStories[i]
        storyIndexRef.current = i

        const buildStatus = useBuildStore.getState().getProjectState(projectId).status
        if (buildStatus === 'idle') {
          appendLog(projectId, 'system', 'Build cancelled')
          break
        }

        const shouldContinue = await waitWhilePaused()
        if (!shouldContinue) {
          appendLog(projectId, 'system', 'Build cancelled while paused')
          isRunningRef.current = false
          return
        }

        const success = await runStory(story)

        if (!success) {
          appendLog(projectId, 'system', 'Build paused due to story failure')
          pauseBuild(projectId)
          isRunningRef.current = false
          return
        }

        const settings = await invoke<ProjectSettings | null>('load_project_settings', { projectPath })
        const autonomy = settings?.autonomy || 'autonomous'

        const remainingStories = usePrdStore.getState().stories.filter((s) => !s.passes)
        if (remainingStories.length > 0) {
          if (autonomy === 'manual' || autonomy === 'pause-between') {
            const nextStory = remainingStories[0]
            setCurrentStory(projectId, nextStory.id, nextStory.title)
            setStoryStatus(projectId, nextStory.id, 'pending')
            appendLog(projectId, 'system', `Pausing ${autonomy === 'manual' ? 'before next story' : 'for review'} (${autonomy} mode)`)
            pauseBuild(projectId)
            isRunningRef.current = false
            return
          }
        }
      }

      const allComplete = usePrdStore.getState().stories.every((s) => s.passes)
      if (allComplete) {
        appendLog(projectId, 'system', '🎉 All stories completed successfully!')
      }

      setCurrentStory(projectId, null)
      cancelBuild(projectId)
      isRunningRef.current = false
    }

    runRemaining()
  }, [projectPath, projectId, runStory, pauseBuild, cancelBuild, appendLog, waitWhilePaused, setCurrentStory, setStoryStatus])

  const handleCancel = useCallback(async () => {
    if (!projectId) return
    
    const processId = useBuildStore.getState().getProjectState(projectId).currentProcessId
    if (processId) {
      try {
        await invoke('kill_agent', { processId })
        unregisterProcess(processId)
        appendLog(projectId, 'system', 'Agent process terminated')
      } catch (error) {
        appendLog(projectId, 'system', `Failed to kill agent: ${error}`)
      }
    }

    for (const [storyId, pid] of activeProcessesRef.current.entries()) {
      try {
        await invoke('kill_agent', { processId: pid })
        unregisterProcess(pid)
        appendLog(projectId, 'system', `Terminated parallel agent for story ${storyId}`)
      } catch (error) {
        appendLog(projectId, 'system', `Failed to kill parallel agent: ${error}`)
      }
    }
    activeProcessesRef.current.clear()

    setCurrentStory(projectId, null)
    cancelBuild(projectId)
    isRunningRef.current = false
    appendLog(projectId, 'system', 'Build cancelled by user')
  }, [projectId, cancelBuild, appendLog, setCurrentStory, unregisterProcess])

  useEffect(() => {
    const handleSidebarStart = (event: Event) => {
      const customEvent = event as CustomEvent<{ projectId: string }>
      if (customEvent.detail.projectId === projectId && status === 'idle' && stories.length > 0 && stories.some(s => !s.passes)) {
        handleStart()
      }
    }

    window.addEventListener('sidebar-start-build', handleSidebarStart)
    return () => {
      window.removeEventListener('sidebar-start-build', handleSidebarStart)
    }
  }, [projectId, status, stories, handleStart])

  useEffect(() => {
    const handleStoryPlay = (event: Event) => {
      const customEvent = event as CustomEvent<{ projectId: string; storyId: string }>
      if (customEvent.detail.projectId === projectId && status === 'idle') {
        runFromStory(customEvent.detail.storyId)
      }
    }

    window.addEventListener('story-play', handleStoryPlay)
    return () => {
      window.removeEventListener('story-play', handleStoryPlay)
    }
  }, [projectId, status, runFromStory])

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
