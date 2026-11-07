// Frontend/Mock-only model. A real backend contract is still pending.
export type LearningPath = 'SELF' | 'BASIC'
export type BasicLearningTransition = {
  chatId: string; transitionId: string; learningPath: 'BASIC'
  status: 'AWAITING_CONTENT'; excludeFromGrowth: true
}
