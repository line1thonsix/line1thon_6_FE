// UI/Mock projection, not a finalized backend DTO. Never contains answer/result bodies.
export type ConversationSummary = {
  id: string
  question: string
  learningPath: 'SELF' | 'BASIC' | null
  progress: 'LOCKED' | 'PENDING' | 'FAILED' | 'DONE'
  createdAt: number
  updatedAt: number
}
export type HistoryItem = ConversationSummary & { reflection: string | null }
export type HistoryFilter = 'ALL' | 'SELF' | 'BASIC'
