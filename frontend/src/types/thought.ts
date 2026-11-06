export type ThoughtPhase = 'writing' | 'submitting' | 'failed' | 'pending'

// Safe view model for the current analysis-waiting boundary. No result fields.
export type PendingThought = {
  chatId: string
  status: 'LOCKED'
  thoughtId: string
  thought: string
  analysis: { jobId: string; status: 'PENDING' }
}
