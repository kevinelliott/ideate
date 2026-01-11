export type StoryStatus = 'pending' | 'in-progress' | 'complete' | 'failed' | 'canceled'

export interface UserStory {
  id: string
  title: string
  description: string
  acceptanceCriteria: string[]
  priority: number
  passes: boolean
  status: StoryStatus
  notes: string
}

export interface PRD {
  project: string
  description: string
  branchName: string
  userStories: UserStory[]
}
