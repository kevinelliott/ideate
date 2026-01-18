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
import { estimateStoryComplexity, checkBudgetLimits, formatTokenEstimate, type BudgetLimits } from '../utils/storyComplexity'
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

interface SnapshotResult {
  snapshotRef: string
  snapshotType: 'stash' | 'commit'
}

interface GlobalPreferences {
  maxParallelAgents?: number
  buildNotifications?: boolean
  maxTokensPerStory?: number | null
  maxCostPerBuild?: number | null
  warnOnLargeStory?: boolean
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
  const tryStartBuild = useBuildStore((state) => state.tryStartBuild)
  const releaseBuildLoop = useBuildStore((state) => state.releaseBuildLoop)
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
  const projects = useProjectStore((state) => state.projects)

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

  const runStory = useCallback(async (story: typeof stories[0], overrideAgentId?: string): Promise<boolean> => {
    if (!projectPath || !projectId) return false

    setCurrentStory(projectId, story.id, story.title)
    setStoryStatus(projectId, story.id, 'in-progress')
    appendLog(projectId, 'system', `Starting story ${story.id}: ${story.title}`)

    // Check budget limits before running
    try {
      const prefs = await invoke<GlobalPreferences | null>('load_preferences')
      if (prefs) {
        const budgetLimits: BudgetLimits = {
          maxTokensPerStory: prefs.maxTokensPerStory ?? null,
          maxCostPerBuild: prefs.maxCostPerBuild ?? null,
          warnOnLargeStory: prefs.warnOnLargeStory ?? true,
        }
        const depGraph = analyzeStoryDependencies(usePrdStore.getState().stories)
        const deps = depGraph[story.id]?.prerequisites.length || 0
        const estimate = estimateStoryComplexity(story, deps)
        const budgetCheck = checkBudgetLimits(estimate, budgetLimits)
        
        if (budgetCheck.exceedsLimit || budgetCheck.warningMessage) {
          appendLog(projectId, 'system', `⚠ Budget warning: ${budgetCheck.warningMessage || `Estimated ~${formatTokenEstimate(estimate.estimatedTokens)} tokens`}`)
          if (estimate.suggestions.length > 0) {
            appendLog(projectId, 'system', `  Suggestion: ${estimate.suggestions[0]}`)
          }
        }
      }
    } catch {
      // Ignore budget check errors - proceed anyway
    }

    // Create a snapshot before running the story for potential rollback
    let snapshot: SnapshotResult | null = null
    try {
      snapshot = await invoke<SnapshotResult>('create_story_snapshot', {
        projectPath,
        storyId: story.id,
      })
      useBuildStore.getState().setStorySnapshot(projectId, story.id, {
        snapshotRef: snapshot.snapshotRef,
        snapshotType: snapshot.snapshotType,
      })
      appendLog(projectId, 'system', `Created snapshot for rollback (${snapshot.snapshotType})`)
    } catch (snapshotError) {
      appendLog(projectId, 'system', `Warning: Could not create snapshot: ${snapshotError}`)
    }

    try {
      const settings = await invoke<ProjectSettings | null>('load_project_settings', { projectPath })
      const agentId = overrideAgentId || settings?.agent || defaultAgentId

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

      const project = projects.find((p) => p.id === projectId)
      registerProcess({
        processId: result.processId,
        projectId,
        projectName: project?.name,
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

      // Check for agent-side errors that still return exit code 0
      const agentErrorPatterns = [
        '❌ Failed',
        'Failed: Unknown error',
        'stream ended without producing any output',
        'amp error:',
        'claude error:',
        'Error: stream ended',
        'connection refused',
        'authentication failed',
        'rate limit exceeded',
        'api key invalid',
      ]
      const hasAgentError = agentErrorPatterns.some((pattern) =>
        recentLogs.toLowerCase().includes(pattern.toLowerCase())
      )

      if (waitResult.success && !hasAgentError) {
        appendLog(projectId, 'system', `✓ Story ${story.id} completed successfully (exit code: ${waitResult.exitCode})`)
        setStoryStatus(projectId, story.id, 'complete')
        updateStory(story.id, { passes: true })
        await savePrd(projectId, projectPath)
        
        // Discard snapshot on success
        if (snapshot) {
          try {
            await invoke('discard_story_snapshot', {
              projectPath,
              snapshotRef: snapshot.snapshotRef,
              snapshotType: snapshot.snapshotType,
            })
            useBuildStore.getState().clearStorySnapshot(projectId, story.id)
          } catch {
            // Ignore cleanup errors
          }
        }
        
        const prefs = await invoke<GlobalPreferences | null>('load_preferences').catch(() => null)
        if (prefs?.buildNotifications !== false) {
          notify.success('Story Complete', story.title)
        }
        return true
      } else {
        const failReason = hasAgentError 
          ? 'agent error detected in output' 
          : `exit code: ${waitResult.exitCode}`
        appendLog(projectId, 'system', `✗ Story ${story.id} failed (${failReason})`)
        appendLog(projectId, 'system', `  Rollback available - use the Rollback button to revert changes`)
        setStoryStatus(projectId, story.id, 'failed')
        const prefs = await invoke<GlobalPreferences | null>('load_preferences').catch(() => null)
        if (prefs?.buildNotifications !== false) {
          notify.error('Story Failed', story.title)
        }
        return false
      }
    } catch (error) {
      appendLog(projectId, 'system', `✗ Error running story ${story.id}: ${error}`)
      appendLog(projectId, 'system', `  Rollback available - use the Rollback button to revert changes`)
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

      const project = projects.find((p) => p.id === projectId)
      registerProcess({
        processId: result.processId,
        projectId,
        projectName: project?.name,
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

      // Check for agent-side errors that still return exit code 0
      const agentErrorPatterns = [
        '❌ Failed',
        'Failed: Unknown error',
        'stream ended without producing any output',
        'amp error:',
        'claude error:',
        'Error: stream ended',
        'connection refused',
        'authentication failed',
        'rate limit exceeded',
        'api key invalid',
      ]
      const hasAgentError = agentErrorPatterns.some((pattern) =>
        recentLogs.toLowerCase().includes(pattern.toLowerCase())
      )
      const storySuccess = waitResult.success && !hasAgentError

      // Finalize worktree (merge if successful, cleanup)
      try {
        await invoke('finalize_story_worktree', {
          projectPath,
          storyId: story.id,
          worktreePath,
          branchName,
          success: storySuccess,
        })
        worktreeRef.current.delete(story.id)

        if (storySuccess) {
          appendLog(projectId, 'system', `✓ [Parallel] Story ${story.id} completed and merged`)
          setStoryStatus(projectId, story.id, 'complete')
          updateStory(story.id, { passes: true })
          await savePrd(projectId, projectPath)
          const prefs = await invoke<GlobalPreferences | null>('load_preferences').catch(() => null)
          if (prefs?.buildNotifications !== false) {
            notify.success('Story Complete', story.title)
          }
          return true
        } else {
          const failReason = hasAgentError 
            ? 'agent error detected in output' 
            : `exit code: ${waitResult.exitCode}`
          appendLog(projectId, 'system', `✗ [Parallel] Story ${story.id} failed (${failReason})`)
          setStoryStatus(projectId, story.id, 'failed')
          const prefs = await invoke<GlobalPreferences | null>('load_preferences').catch(() => null)
          if (prefs?.buildNotifications !== false) {
            notify.error('Story Failed', story.title)
          }
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
    if (!projectPath || !projectId) return
    
    if (!tryStartBuild(projectId)) {
      return
    }

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
      releaseBuildLoop(projectId)
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

    const finalPrefs = await invoke<GlobalPreferences | null>('load_preferences').catch(() => null)
    const notificationsEnabled = finalPrefs?.buildNotifications !== false

    if (allComplete) {
      appendLog(projectId, 'system', '🎉 All stories completed successfully!')
      if (notificationsEnabled) {
        notify.success('Build Complete', 'All stories completed successfully')
      }
    } else if (cancelled) {
      appendLog(projectId, 'system', 'Build cancelled')
    } else {
      const incompleteCount = failedCount + blockedCount
      appendLog(projectId, 'system', `Build finished: ${failedCount} failed, ${blockedCount} blocked`)
      if (notificationsEnabled) {
        notify.warning('Build Finished', `${incompleteCount} ${incompleteCount === 1 ? 'story' : 'stories'} still incomplete`)
      }
    }

    setCurrentStory(projectId, null)
    cancelBuild(projectId)
    releaseBuildLoop(projectId)
  }, [projectPath, projectId, stories, runStoryParallel, clearLogs, resetStoryStatuses, startBuild, cancelBuild, appendLog, setCurrentStory, showBuildStatus, tryStartBuild, releaseBuildLoop])

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
    if (!projectPath || !projectId) return
    
    if (!tryStartBuild(projectId)) {
      return
    }

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
      releaseBuildLoop(projectId)
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
        releaseBuildLoop(projectId)
        return
      }

      const success = await runStory(story)

      if (!success) {
        appendLog(projectId, 'system', 'Build paused due to story failure')
        pauseBuild(projectId)
        releaseBuildLoop(projectId)
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
          releaseBuildLoop(projectId)
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
    releaseBuildLoop(projectId)
  }, [projectPath, projectId, runStory, startBuild, pauseBuild, cancelBuild, appendLog, waitWhilePaused, setCurrentStory, setStoryStatus, stories, clearLogs, resetStoryStatuses, tryStartBuild, releaseBuildLoop])

  const runBuildLoop = useCallback(async () => {
    if (!projectPath || !projectId) return

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

    if (!tryStartBuild(projectId)) {
      return
    }
    
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
        releaseBuildLoop(projectId)
        return
      }

      const shouldContinue = await waitWhilePaused()
      if (!shouldContinue) {
        appendLog(projectId, 'system', 'Build cancelled while paused')
        releaseBuildLoop(projectId)
        return
      }

      const success = await runStory(story)

      if (!success) {
        appendLog(projectId, 'system', 'Build paused due to story failure')
        pauseBuild(projectId)
        releaseBuildLoop(projectId)
        return
      }

      const remainingStories = usePrdStore.getState().stories.filter((s) => !s.passes)
      if (shouldPauseForAutonomy(autonomy, 'after', remainingStories.length > 0)) {
        if (autonomy === 'pause-between') {
          appendLog(projectId, 'system', 'Pausing for review (pause-between mode)')
          pauseBuild(projectId)
          releaseBuildLoop(projectId)
          return
        }
      }
    }

    const allComplete = usePrdStore.getState().stories.every((s) => s.passes)
    const buildPrefs = await invoke<GlobalPreferences | null>('load_preferences').catch(() => null)
    const buildNotificationsEnabled = buildPrefs?.buildNotifications !== false

    if (allComplete) {
      appendLog(projectId, 'system', '🎉 All stories completed successfully!')
      if (buildNotificationsEnabled) {
        notify.success('Build Complete', 'All stories completed successfully')
      }
    } else {
      const failedCount = usePrdStore.getState().stories.filter((s) => !s.passes).length
      if (buildNotificationsEnabled) {
        notify.warning('Build Finished', `${failedCount} ${failedCount === 1 ? 'story' : 'stories'} still incomplete`)
      }
    }

    setCurrentStory(projectId, null)
    cancelBuild(projectId)
    releaseBuildLoop(projectId)
  }, [projectPath, projectId, stories, runStory, runParallelBuildLoop, clearLogs, resetStoryStatuses, startBuild, pauseBuild, cancelBuild, appendLog, waitWhilePaused, shouldPauseForAutonomy, setCurrentStory, setStoryStatus, showBuildStatus, tryStartBuild, releaseBuildLoop])

  const handleStart = useCallback(() => {
    runBuildLoop()
  }, [runBuildLoop])

  const handleResume = useCallback(() => {
    if (!projectPath || !projectId) return
    
    if (!tryStartBuild(projectId)) {
      return
    }

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
          releaseBuildLoop(projectId)
          return
        }

        const success = await runStory(story)

        if (!success) {
          appendLog(projectId, 'system', 'Build paused due to story failure')
          pauseBuild(projectId)
          releaseBuildLoop(projectId)
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
            releaseBuildLoop(projectId)
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
      releaseBuildLoop(projectId)
    }

    runRemaining()
  }, [projectPath, projectId, runStory, pauseBuild, cancelBuild, appendLog, waitWhilePaused, setCurrentStory, setStoryStatus, tryStartBuild, releaseBuildLoop])

  const handleCancel = useCallback(async (overrideProjectId?: string) => {
    const targetProjectId = overrideProjectId || projectId
    if (!targetProjectId) return
    
    const state = useBuildStore.getState()
    const projectState = state.getProjectState(targetProjectId)
    const processId = projectState.currentProcessId
    
    if (processId) {
      try {
        await invoke('kill_agent', { processId: processId })
        unregisterProcess(processId, null, false)
        state.appendLog(targetProjectId, 'system', 'Agent process terminated')
      } catch (error) {
        state.appendLog(targetProjectId, 'system', `Failed to kill agent: ${error}`)
      }
    }

    for (const [storyId, pid] of activeProcessesRef.current.entries()) {
      try {
        await invoke('kill_agent', { processId: pid })
        unregisterProcess(pid, null, false)
        state.appendLog(targetProjectId, 'system', `Terminated parallel agent for story ${storyId}`)
      } catch (error) {
        state.appendLog(targetProjectId, 'system', `Failed to kill parallel agent: ${error}`)
      }
    }
    activeProcessesRef.current.clear()

    // Cleanup all worktrees for parallel builds
    if (projectPath && worktreeRef.current.size > 0) {
      state.appendLog(targetProjectId, 'system', 'Cleaning up worktrees...')
      await invoke('cleanup_all_story_worktrees', { projectPath }).catch(() => {})
      worktreeRef.current.clear()
    }

    state.setCurrentStory(targetProjectId, null)
    state.cancelBuild(targetProjectId)
    releaseBuildLoop(targetProjectId)
    state.appendLog(targetProjectId, 'system', 'Build cancelled by user')
  }, [projectId, projectPath, unregisterProcess, releaseBuildLoop])

  useEffect(() => {
    const handleSidebarStart = (event: Event) => {
      const customEvent = event as CustomEvent<{ projectId: string }>
      if (customEvent.detail.projectId !== projectId) return
      const currentStatus = useBuildStore.getState().getProjectState(projectId || '').status
      const currentStories = usePrdStore.getState().stories
      if (currentStatus === 'idle' && currentStories.length > 0 && currentStories.some(s => !s.passes)) {
        handleStart()
      }
    }

    const handleResumeEvent = (event: Event) => {
      const customEvent = event as CustomEvent<{ projectId: string }>
      if (customEvent.detail.projectId !== projectId) return
      const currentStatus = useBuildStore.getState().getProjectState(projectId || '').status
      if (currentStatus === 'paused') {
        handleResume()
      }
    }

    const handleCancelEvent = (event: Event) => {
      const customEvent = event as CustomEvent<{ projectId: string }>
      const eventProjectId = customEvent.detail.projectId
      if (eventProjectId !== projectId) return
      const currentStatus = useBuildStore.getState().getProjectState(eventProjectId).status
      if (currentStatus !== 'idle') {
        handleCancel(eventProjectId)
      }
    }

    window.addEventListener('sidebar-start-build', handleSidebarStart)
    window.addEventListener('resume-build', handleResumeEvent)
    window.addEventListener('cancel-build', handleCancelEvent)
    return () => {
      window.removeEventListener('sidebar-start-build', handleSidebarStart)
      window.removeEventListener('resume-build', handleResumeEvent)
      window.removeEventListener('cancel-build', handleCancelEvent)
    }
  }, [projectId, handleStart, handleResume, handleCancel])

  useEffect(() => {
    const handleStoryPlay = (event: Event) => {
      const customEvent = event as CustomEvent<{ projectId: string; storyId: string }>
      if (customEvent.detail.projectId !== projectId) return
      const currentStatus = useBuildStore.getState().getProjectState(projectId || '').status
      if (currentStatus === 'idle') {
        runFromStory(customEvent.detail.storyId)
      }
    }

    window.addEventListener('story-play', handleStoryPlay)
    return () => {
      window.removeEventListener('story-play', handleStoryPlay)
    }
  }, [projectId, runFromStory])

  const retryStoryWithAgent = useCallback(async (storyId: string, agentId?: string) => {
    if (!projectPath || !projectId) return
    
    if (!tryStartBuild(projectId)) {
      return
    }

    const story = usePrdStore.getState().stories.find(s => s.id === storyId)
    if (!story) {
      appendLog(projectId, 'system', `Story ${storyId} not found`)
      releaseBuildLoop(projectId)
      return
    }

    startBuild(projectId)
    appendLog(projectId, 'system', `Retrying story ${storyId}${agentId ? ` with ${agentId}` : ''}`)

    const success = await runStory(story, agentId)

    if (!success) {
      appendLog(projectId, 'system', 'Retry paused due to story failure')
      pauseBuild(projectId)
    } else {
      cancelBuild(projectId)
    }

    setCurrentStory(projectId, null)
    releaseBuildLoop(projectId)
  }, [projectPath, projectId, runStory, startBuild, pauseBuild, cancelBuild, appendLog, setCurrentStory, tryStartBuild, releaseBuildLoop])

  useEffect(() => {
    const handleRetryWithAgent = (event: Event) => {
      const customEvent = event as CustomEvent<{ projectId: string; storyId: string; agentId?: string }>
      if (customEvent.detail.projectId === projectId && status !== 'running') {
        retryStoryWithAgent(customEvent.detail.storyId, customEvent.detail.agentId)
      }
    }

    window.addEventListener('retry-story-with-agent', handleRetryWithAgent)
    return () => {
      window.removeEventListener('retry-story-with-agent', handleRetryWithAgent)
    }
  }, [projectId, status, retryStoryWithAgent])

  useEffect(() => {
    return () => {
      if (projectId) {
        releaseBuildLoop(projectId)
      }
    }
  }, [projectId, releaseBuildLoop])

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
