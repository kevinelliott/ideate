import type { Story } from '../stores/prdStore'

export interface StoryDeps {
  storyId: string
  prerequisites: string[]
  conflicts: string[]
}

export type StoryDepGraph = Record<string, StoryDeps>

export function analyzeStoryDependencies(stories: Story[]): StoryDepGraph {
  const graph: StoryDepGraph = {}

  for (const story of stories) {
    const text = [
      story.title,
      story.description,
      story.acceptanceCriteria.join('\n'),
      story.notes ?? '',
    ].join('\n').toLowerCase()

    const prerequisites = new Set<string>()

    for (const other of stories) {
      if (other.id === story.id) continue
      
      if (text.includes(other.id.toLowerCase())) {
        prerequisites.add(other.id)
      }
      
      const otherTitle = other.title.toLowerCase()
      const dependencyPatterns = [
        `after ${otherTitle}`,
        `depends on ${otherTitle}`,
        `requires ${otherTitle}`,
        `following ${otherTitle}`,
        `once ${otherTitle}`,
      ]
      
      for (const pattern of dependencyPatterns) {
        if (text.includes(pattern)) {
          prerequisites.add(other.id)
          break
        }
      }
      
      const notes = (story.notes ?? '').toLowerCase()
      if (notes.includes(other.id.toLowerCase()) || 
          notes.includes(`prerequisite: ${otherTitle}`) ||
          notes.includes(`depends: ${otherTitle}`)) {
        prerequisites.add(other.id)
      }
    }

    graph[story.id] = {
      storyId: story.id,
      prerequisites: Array.from(prerequisites),
      conflicts: [],
    }
  }

  return graph
}

export function getStoryById(stories: Story[], id: string): Story | undefined {
  return stories.find(s => s.id === id)
}

export function getDependentsOf(graph: StoryDepGraph, storyId: string): string[] {
  return Object.values(graph)
    .filter(dep => dep.prerequisites.includes(storyId))
    .map(dep => dep.storyId)
}
