import type { Story } from '../stores/prdStore'

export type ComplexityLevel = 'low' | 'medium' | 'high'

export interface ComplexityEstimate {
  level: ComplexityLevel
  score: number
  estimatedTokens: number
  factors: string[]
  suggestions: string[]
}

export interface BudgetLimits {
  maxTokensPerStory: number | null
  maxCostPerBuild: number | null
  warnOnLargeStory: boolean
}

const TOKENS_PER_CHAR = 0.25
const BASE_TOKENS = 500
const TOKENS_PER_CRITERION = 200
const TOKENS_PER_DEPENDENCY = 100

const COMPLEXITY_THRESHOLDS = {
  low: 2000,
  medium: 5000,
}

export function estimateStoryComplexity(story: Story, dependencyCount: number = 0): ComplexityEstimate {
  const factors: string[] = []
  const suggestions: string[] = []
  
  let score = 0
  let estimatedTokens = BASE_TOKENS

  const descriptionLength = story.description.length
  const descriptionTokens = Math.round(descriptionLength * TOKENS_PER_CHAR)
  estimatedTokens += descriptionTokens
  
  if (descriptionLength > 500) {
    score += 2
    factors.push('Long description')
    if (descriptionLength > 1000) {
      score += 2
      suggestions.push('Consider splitting the description into separate stories')
    }
  } else if (descriptionLength > 200) {
    score += 1
    factors.push('Medium description')
  }

  const criteriaCount = story.acceptanceCriteria.length
  estimatedTokens += criteriaCount * TOKENS_PER_CRITERION
  
  if (criteriaCount > 7) {
    score += 3
    factors.push(`Many acceptance criteria (${criteriaCount})`)
    suggestions.push('Stories with 7+ criteria are harder to implement correctly. Consider breaking into smaller stories.')
  } else if (criteriaCount > 4) {
    score += 2
    factors.push(`Multiple acceptance criteria (${criteriaCount})`)
  } else if (criteriaCount > 2) {
    score += 1
    factors.push(`Some acceptance criteria (${criteriaCount})`)
  }

  const totalCriteriaLength = story.acceptanceCriteria.reduce((sum, c) => sum + c.length, 0)
  if (totalCriteriaLength > 500) {
    score += 1
    factors.push('Detailed criteria')
  }

  if (dependencyCount > 0) {
    estimatedTokens += dependencyCount * TOKENS_PER_DEPENDENCY
    if (dependencyCount > 3) {
      score += 2
      factors.push(`Many dependencies (${dependencyCount})`)
      suggestions.push('Stories with many dependencies may have complex interactions. Consider consolidating or reordering.')
    } else if (dependencyCount > 1) {
      score += 1
      factors.push(`Has dependencies (${dependencyCount})`)
    }
  }

  const notesLength = story.notes?.length || 0
  if (notesLength > 300) {
    score += 1
    factors.push('Detailed notes')
    estimatedTokens += Math.round(notesLength * TOKENS_PER_CHAR)
  }

  let level: ComplexityLevel
  if (estimatedTokens < COMPLEXITY_THRESHOLDS.low) {
    level = 'low'
  } else if (estimatedTokens < COMPLEXITY_THRESHOLDS.medium) {
    level = 'medium'
  } else {
    level = 'high'
  }

  if (level === 'high' && suggestions.length === 0) {
    suggestions.push('This story may take significant tokens. Consider breaking it into smaller, focused stories.')
  }

  return {
    level,
    score,
    estimatedTokens,
    factors: factors.length > 0 ? factors : ['Simple story'],
    suggestions,
  }
}

export function estimateBuildComplexity(
  stories: Story[],
  dependencyGraph: Record<string, { prerequisites: string[] }>
): {
  totalEstimatedTokens: number
  storyEstimates: Record<string, ComplexityEstimate>
  highComplexityCount: number
  mediumComplexityCount: number
  lowComplexityCount: number
} {
  const storyEstimates: Record<string, ComplexityEstimate> = {}
  let totalEstimatedTokens = 0
  let highComplexityCount = 0
  let mediumComplexityCount = 0
  let lowComplexityCount = 0

  for (const story of stories) {
    const deps = dependencyGraph[story.id]?.prerequisites.length || 0
    const estimate = estimateStoryComplexity(story, deps)
    storyEstimates[story.id] = estimate
    totalEstimatedTokens += estimate.estimatedTokens

    if (estimate.level === 'high') highComplexityCount++
    else if (estimate.level === 'medium') mediumComplexityCount++
    else lowComplexityCount++
  }

  return {
    totalEstimatedTokens,
    storyEstimates,
    highComplexityCount,
    mediumComplexityCount,
    lowComplexityCount,
  }
}

export function checkBudgetLimits(
  estimate: ComplexityEstimate,
  limits: BudgetLimits
): {
  exceedsLimit: boolean
  warningMessage: string | null
} {
  if (limits.maxTokensPerStory && estimate.estimatedTokens > limits.maxTokensPerStory) {
    return {
      exceedsLimit: true,
      warningMessage: `Estimated ${estimate.estimatedTokens.toLocaleString()} tokens exceeds limit of ${limits.maxTokensPerStory.toLocaleString()}`,
    }
  }

  if (limits.warnOnLargeStory && estimate.level === 'high') {
    return {
      exceedsLimit: false,
      warningMessage: 'This story has high complexity and may use significant tokens',
    }
  }

  return {
    exceedsLimit: false,
    warningMessage: null,
  }
}

export function formatTokenEstimate(tokens: number): string {
  if (tokens >= 1000000) {
    return `${(tokens / 1000000).toFixed(1)}M`
  }
  if (tokens >= 1000) {
    return `${(tokens / 1000).toFixed(1)}K`
  }
  return tokens.toString()
}

export function getComplexityColor(level: ComplexityLevel): string {
  switch (level) {
    case 'low':
      return 'text-success'
    case 'medium':
      return 'text-warning'
    case 'high':
      return 'text-destructive'
  }
}

export function getComplexityBgColor(level: ComplexityLevel): string {
  switch (level) {
    case 'low':
      return 'bg-success/10'
    case 'medium':
      return 'bg-warning/10'
    case 'high':
      return 'bg-destructive/10'
  }
}
