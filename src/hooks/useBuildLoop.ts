import { useCallback, useEffect, useRef } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { useBuildStore, type LogEntry, type StoryRetryInfo, type ConflictInfo } from '../stores/buildStore'
import { usePrdStore } from '../stores/prdStore'
import { useCostStore } from '../stores/costStore'
import { useProcessStore } from '../stores/processStore'
import { useAgentStore } from '../stores/agentStore'
import { useProjectStore } from '../stores/projectStore'
import { defaultPlugins } from '../types'
import { usePromptStore } from '../stores/promptStore'
import { notify } from '../utils/notify'
import { analyzeStoryDependencies } from '../utils/storyDependencies'
import type { AutonomyLevel, BuildMode } from '../components/ProjectTopBar'

interface SpawnAgentResult {
  processId: string
}

interface WaitAgentResult {
  processId: string
  exitCode: number | null
  success: boolean
}

interface ProjectSettings {
  agent: string | null
  autonomy: AutonomyLevel
  buildMode: BuildMode | null
}

const DEFAULT_PARALLEL_LIMIT = 4

interface WorktreeResult {
  worktreePath: string
  branchName: string
}

interface GlobalPreferences {
  maxParallelAgents?: number
}

function formatRetryContext(retryInfo: StoryRetryInfo): string {
  if (retryInfo.previousLogs.length === 0) return ''
  
  const lastAttemptLogs = retryInfo.previousLogs[retryInfo.previousLogs.length - 1]
  const relevantLogs = lastAttemptLogs
    .filter((log: LogEntry) => log.type === 'stderr' || log.content.includes('error') || log.content.includes('Error') || log.content.includes('failed') || log.content.includes('Failed'))
    .slice(-25)
  
  if (relevantLogs.length === 0) {
    const fallbackLogs = lastAttemptLogs.slice(-20)
    return fallbackLogs.map((log: LogEntry) => log.content).join('\n')
  }
  
  return relevantLogs.map((log: LogEntry) => log.content).join('\n')
}

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
  const defaultAgentId = useAgentStore((state) => state.defaultAgentId)
  const showBuildStatus = useProjectStore((state) => state.showBuildStatus)

  const isRunningRef = useRef(false)
  const storyIndexRef = useRef(0)
  const activeProcessesRef = useRef<Map<string, string>>(new Map())
  const worktreeRef = useRef<Map<string, { path: string; branch: string }>>(new Map())

  const projectState = projectId ? getProjectState(projectId) : null
  const status = projectState?.status || 'idle'
  const currentStoryId = projectState?.currentStoryId || null
  const currentProcessId = projectState?.currentProcessId || null

  const generatePrompt = useCallback((story: typeof stories[0], retryInfo?: StoryRetryInfo): string => {
    const criteria = story.acceptanceCriteria.map((c, i) => `${i + 1}. ${c}`).join('\n')
    const notesSection = story.notes ? `### Notes:\n${story.notes}` : ''
    
    let retrySection = ''
    if (retryInfo && retryInfo.retryCount > 0 && retryInfo.previousLogs.length > 0) {
      const errorContext = formatRetryContext(retryInfo)
      if (errorContext) {
        retrySection = `\n\n### Previous Attempt Failed (Attempt ${retryInfo.retryCount}):\nThe previous implementation attempt failed. Here are the relevant error logs:\n\`\`\`\n${errorContext}\n\`\`\`\nPlease analyze these errors and fix the issues in your implementation.`
      }
    }
    
    return getPrompt('storyImplementation', {
      '{{storyId}}': story.id,
      '{{storyTitle}}': story.title,
      '{{storyDescription}}': story.description,
      '{{acceptanceCriteria}}': criteria,
      '{{notes}}': notesSection + retrySection,
    })
  }, [getPrompt])

  const runStory = useCallback(async (story: typeof stories[0]): Promise<boolean> => {
    if (!projectPath || !projectId) return false

    setCurrentStory(projectId, story.id, story.title)
    setStoryStatus(projectId, story.id, 'in-progress')
    appendLog(projectId, 'system', `Starting story ${story.id}: ${story.title}`)

    try {
      const settings = await invoke<ProjectSettings | null>('load_project_settings', { projectPath })
      const agentId = settings?.agent || defaultAgentId

      const plugin = defaultPlugins.find((p) => p.id === agentId) || defaultPlugins[0]
      const retryInfo = useBuildStore.getState().getStoryRetryInfo(projectId, story.id)
      const prompt = generatePrompt(story, retryInfo)
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

      setCurrentProcessId(projectId, result.processId)
      appendLog(projectId, 'system', `Agent process started (ID: ${result.processId})`)

      registerProcess({
        processId: result.processId,
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
        processId: result.processId,
      })

      const durationMs = Date.now() - startTime

      unregisterProcess(result.processId, waitResult.exitCode, waitResult.success)
      setCurrentProcessId(projectId, null)

      const logs = useBuildStore.getState().getProjectState(projectId).logs
      const recentLogs = logs.slice(-50).map(l => l.content).join('\n')
      parseAndAddFromOutput(projectId, projectPath, agentId, `Story: ${story.title}`, recentLogs, durationMs)

      if (waitResult.success) {
        appendLog(projectId, 'system', `✓ Story ${story.id} completed successfully (exit code: ${waitResult.exitCode})`)
        setStoryStatus(projectId, story.id, 'complete')
        updateStory(story.id, { passes: true })
        await savePrd(projectPath)
        return true
      } else {
        appendLog(projectId, 'system', `✗ Story ${story.id} failed (exit code: ${waitResult.exitCode})`)
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

    let worktreePath: string | null = null
    let branchName: string | null = null

    try {
      // Prepare worktree for isolated file edits
      const prep = await invoke<WorktreeResult>('prepare_story_worktree', {
        projectPath,
        storyId: story.id,
      })
      worktreePath = prep.worktreePath
      branchName = prep.branchName
      worktreeRef.current.set(story.id, { path: worktreePath, branch: branchName })
      appendLog(projectId, 'system', `[Parallel] Created worktree for ${story.id} at ${worktreePath}`)

      const settings = await invoke<ProjectSettings | null>('load_project_settings', { projectPath })
      const agentId = settings?.agent || defaultAgentId

      const plugin = defaultPlugins.find((p) => p.id === agentId) || defaultPlugins[0]
      const retryInfo = useBuildStore.getState().getStoryRetryInfo(projectId, story.id)
      const prompt = generatePrompt(story, retryInfo)
      const args = plugin.argsTemplate.map((arg) =>
        arg.replace('{{prompt}}', prompt)
      )

      const startTime = Date.now()

      // Spawn agent in the worktree directory, not main project
      const result = await invoke<SpawnAgentResult>('spawn_agent', {
        executable: plugin.command,
        args,
        workingDirectory: worktreePath,
      })

      activeProcessesRef.current.set(story.id, result.processId)
      appendLog(projectId, 'system', `[Parallel] Agent started for ${story.id} (PID: ${result.processId})`)

      registerProcess({
        processId: result.processId,
        projectId,
        type: 'build',
        label: `[P] ${story.title}`,
        agentId,
        command: {
          executable: plugin.command,
          args,
          workingDirectory: worktreePath,
        },
      })

      const waitResult = await invoke<WaitAgentResult>('wait_agent', {
        processId: result.processId,
      })

      const durationMs = Date.now() - startTime

      unregisterProcess(result.processId, waitResult.exitCode, waitResult.success)
      activeProcessesRef.current.delete(story.id)

      const logs = useBuildStore.getState().getProjectState(projectId).logs
      const recentLogs = logs.slice(-50).map(l => l.content).join('\n')
      parseAndAddFromOutput(projectId, projectPath, agentId, `Story: ${story.title}`, recentLogs, durationMs)

      // Finalize worktree (merge if successful, cleanup)
      try {
        await invoke('finalize_story_worktree', {
          projectPath,
          storyId: story.id,
          worktreePath,
          branchName,
          success: waitResult.success,
        })
        worktreeRef.current.delete(story.id)

        if (waitResult.success) {
          appendLog(projectId, 'system', `✓ [Parallel] Story ${story.id} completed and merged`)
          setStoryStatus(projectId, story.id, 'complete')
          updateStory(story.id, { passes: true })
          await savePrd(projectPath)
          return true
        } else {
          appendLog(projectId, 'system', `✗ [Parallel] Story ${story.id} failed (exit code: ${waitResult.exitCode})`)
          setStoryStatus(projectId, story.id, 'failed')
          return false
        }
      } catch (finalizeError) {
        const errorStr = String(finalizeError)
        if (errorStr.includes('Merge conflict')) {
          const conflict: ConflictInfo = {
            storyId: story.id,
            storyTitle: story.title,
            branchName: branchName,
          }
          useBuildStore.getState().addConflictedBranch(projectId, conflict)
          appendLog(projectId, 'system', `⚠ [Parallel] Merge conflict for story ${story.id} - changes kept in branch: ${branchName}`)
          notify.warning('Merge Conflict', `Story ${story.id} has conflicts. Resolve manually in branch: ${branchName}`)
          setStoryStatus(projectId, story.id, 'failed')
          worktreeRef.current.delete(story.id)
          return false
        }
        throw finalizeError
      }
    } catch (error) {
      appendLog(projectId, 'system', `✗ [Parallel] Error running story ${story.id}: ${error}`)
      setStoryStatus(projectId, story.id, 'failed')
      activeProcessesRef.current.delete(story.id)

      // Cleanup worktree on error
      if (worktreePath && branchName) {
        await invoke('finalize_story_worktree', {
          projectPath,
          storyId: story.id,
          worktreePath,
          branchName,
          success: false,
        }).catch(() => {})
        worktreeRef.current.delete(story.id)
      }

      return false
    }
  }, [projectPath, projectId, generatePrompt, setStoryStatus, appendLog, updateStory, savePrd, parseAndAddFromOutput, registerProcess, unregisterProcess, defaultAgentId])

  const runParallelBuildLoop = useCallback(async () => {
    if (!projectPath || !projectId || isRunningRef.current) return

    isRunningRef.current = true
    clearLogs(projectId)
    resetStoryStatuses(projectId)
    useBuildStore.getState().clearConflictedBranches(projectId)
    startBuild(projectId)
    appendLog(projectId, 'system', '🚀 Parallel build started')

    const allStories = usePrdStore.getState().stories
    const incompleteStories = allStories
      .filter((s) => !s.passes)
      .sort((a, b) => a.priority - b.priority)

    if (incompleteStories.length === 0) {
      appendLog(projectId, 'system', 'No stories to build')
      cancelBuild(projectId)
      isRunningRef.current = false
      return
    }

    // Auto-navigate to Build Status for parallel builds
    showBuildStatus(projectId)

    // Load max parallel agents from preferences
    let maxParallelAgents = DEFAULT_PARALLEL_LIMIT
    try {
      const prefs = await invoke<GlobalPreferences | null>('load_preferences')
      if (prefs?.maxParallelAgents && prefs.maxParallelAgents > 0) {
        maxParallelAgents = prefs.maxParallelAgents
      }
    } catch {
      // Use default
    }

    appendLog(projectId, 'system', `Running ${incompleteStories.length} stories with up to ${maxParallelAgents} concurrent agents`)

    // Analyze dependencies
    const depGraph = analyzeStoryDependencies(incompleteStories)
    const depsWithPrereqs = Object.values(depGraph).filter(d => d.prerequisites.length > 0)
    if (depsWithPrereqs.length > 0) {
      appendLog(projectId, 'system', `Detected ${depsWithPrereqs.length} stories with prerequisites`)
      for (const dep of depsWithPrereqs) {
        appendLog(projectId, 'system', `  ${dep.storyId} depends on: ${dep.prerequisites.join(', ')}`)
      }
    }

    // Scheduler state
    type StoryStatusLocal = 'pending' | 'in-progress' | 'complete' | 'failed'
    const statusMap = new Map<string, StoryStatusLocal>()
    incompleteStories.forEach(s => statusMap.set(s.id, 'pending'))

    let activeCount = 0
    let cancelled = false

    const checkCancelled = () => {
      const buildStatus = useBuildStore.getState().getProjectState(projectId).status
      if (buildStatus === 'idle') cancelled = true
      return cancelled
    }

    const waitForPauseOrContinue = async (): Promise<boolean> => {
      while (true) {
        const buildStatus = useBuildStore.getState().getProjectState(projectId).status
        if (buildStatus === 'idle') return false
        if (buildStatus === 'running') return true
        await new Promise(resolve => setTimeout(resolve, 200))
      }
    }

    const getReadyStories = (): typeof incompleteStories => {
      const runningIds = new Set(
        Array.from(statusMap.entries())
          .filter(([_, st]) => st === 'in-progress')
          .map(([id]) => id)
      )

      return incompleteStories.filter(story => {
        const localStatus = statusMap.get(story.id)
        if (localStatus !== 'pending') return false

        const deps = depGraph[story.id]?.prerequisites ?? []
        const conflicts = depGraph[story.id]?.conflicts ?? []

        // All prerequisites must be complete
        const depsSatisfied = deps.every(depId => {
          const depStory = allStories.find(s => s.id === depId)
          return depStory?.passes || statusMap.get(depId) === 'complete'
        })

        if (!depsSatisfied) return false

        // Avoid conflicts with currently running stories
        const hasConflict = conflicts.some(cId => runningIds.has(cId))
        if (hasConflict) return false

        return true
      })
    }

    let resolveLoop: (() => void) | null = null
    const loopPromise = new Promise<void>(resolve => { resolveLoop = resolve })

    const scheduleNext = async () => {
      if (cancelled || checkCancelled()) {
        if (activeCount === 0 && resolveLoop) resolveLoop()
        return
      }

      // Check for pause
      const buildStatus = useBuildStore.getState().getProjectState(projectId).status
      if (buildStatus === 'paused') {
        appendLog(projectId, 'system', 'Build paused - waiting to resume...')
        const shouldContinue = await waitForPauseOrContinue()
        if (!shouldContinue) {
          cancelled = true
          if (activeCount === 0 && resolveLoop) resolveLoop()
          return
        }
        appendLog(projectId, 'system', 'Build resumed')
      }

      const ready = getReadyStories()
      const remainingPendingOrInProgress = Array.from(statusMap.values())
        .some(st => st === 'pending' || st === 'in-progress')

      if (ready.length === 0 && activeCount === 0) {
        // Nothing running, nothing ready
        if (remainingPendingOrInProgress) {
          const pendingCount = Array.from(statusMap.values()).filter(st => st === 'pending').length
          if (pendingCount > 0) {
            appendLog(projectId, 'system', `⚠️ ${pendingCount} stories blocked by unmet prerequisites`)
          }
        }
        if (resolveLoop) resolveLoop()
        return
      }

      // Fill capacity with ready stories (sorted by priority)
      ready.sort((a, b) => a.priority - b.priority)
      
      while (activeCount < maxParallelAgents && ready.length > 0) {
        const story = ready.shift()!
        statusMap.set(story.id, 'in-progress')
        activeCount++

        // Run story async, schedule next when done
        runStoryParallel(story)
          .then((success) => {
            if (success) {
              statusMap.set(story.id, 'complete')
            } else {
              statusMap.set(story.id, 'failed')
            }
          })
          .catch(() => {
            statusMap.set(story.id, 'failed')
          })
          .finally(() => {
            activeCount--
            checkCancelled()
            scheduleNext()
          })
      }
    }

    // Start scheduling
    await scheduleNext()
    await loopPromise

    // Finalization
    const allComplete = usePrdStore.getState().stories.every((s) => s.passes)
    const failedCount = Array.from(statusMap.values()).filter(st => st === 'failed').length
    const blockedCount = Array.from(statusMap.values()).filter(st => st === 'pending').length

    if (allComplete) {
      appendLog(projectId, 'system', '🎉 All stories completed successfully!')
      notify.success('Build complete', 'All stories completed successfully')
    } else if (cancelled) {
      appendLog(projectId, 'system', 'Build cancelled')
    } else {
      const incompleteCount = failedCount + blockedCount
      appendLog(projectId, 'system', `Build finished: ${failedCount} failed, ${blockedCount} blocked`)
      notify.warning('Build finished', `${incompleteCount} ${incompleteCount === 1 ? 'story' : 'stories'} still incomplete`)
    }

    setCurrentStory(projectId, null)
    cancelBuild(projectId)
    isRunningRef.current = false
  }, [projectPath, projectId, stories, runStoryParallel, clearLogs, resetStoryStatuses, startBuild, cancelBuild, appendLog, setCurrentStory, showBuildStatus])

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
    const buildMode = settings?.buildMode || 'ralph'
    const autonomy = settings?.autonomy || 'autonomous'

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

    // Auto-navigate to Build Status, except for manual mode with single story
    const shouldAutoNavigate = !(autonomy === 'manual' && incompleteStories.length === 1)
    if (shouldAutoNavigate) {
      showBuildStatus(projectId)
    }

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
      notify.success('Build complete', 'All stories completed successfully')
    } else {
      const failedCount = usePrdStore.getState().stories.filter((s) => !s.passes).length
      notify.warning('Build finished', `${failedCount} ${failedCount === 1 ? 'story' : 'stories'} still incomplete`)
    }

    setCurrentStory(projectId, null)
    cancelBuild(projectId)
    isRunningRef.current = false
  }, [projectPath, projectId, stories, runStory, runParallelBuildLoop, clearLogs, resetStoryStatuses, startBuild, pauseBuild, cancelBuild, appendLog, waitWhilePaused, shouldPauseForAutonomy, setCurrentStory, setStoryStatus, showBuildStatus])

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
        await invoke('kill_agent', { processId: processId })
        unregisterProcess(processId, null, false)
        appendLog(projectId, 'system', 'Agent process terminated')
      } catch (error) {
        appendLog(projectId, 'system', `Failed to kill agent: ${error}`)
      }
    }

    for (const [storyId, pid] of activeProcessesRef.current.entries()) {
      try {
        await invoke('kill_agent', { processId: pid })
        unregisterProcess(pid, null, false)
        appendLog(projectId, 'system', `Terminated parallel agent for story ${storyId}`)
      } catch (error) {
        appendLog(projectId, 'system', `Failed to kill parallel agent: ${error}`)
      }
    }
    activeProcessesRef.current.clear()

    // Cleanup all worktrees for parallel builds
    if (projectPath && worktreeRef.current.size > 0) {
      appendLog(projectId, 'system', 'Cleaning up worktrees...')
      await invoke('cleanup_all_story_worktrees', { projectPath }).catch(() => {})
      worktreeRef.current.clear()
    }

    setCurrentStory(projectId, null)
    cancelBuild(projectId)
    isRunningRef.current = false
    appendLog(projectId, 'system', 'Build cancelled by user')
  }, [projectId, projectPath, cancelBuild, appendLog, setCurrentStory, unregisterProcess])

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
