import type { BasicLearningTransition } from '../types/learning.ts'

// Transition metadata only. No answer, explanations, findings, or evaluation fields.
export function readBasicLearningTransition(value: unknown, chatId: string): BasicLearningTransition {
  if (!value || typeof value !== 'object') throw new Error('기초 학습 전환 상태를 확인할 수 없어요.')
  const v = value as Record<string, unknown>
  if (v.chatId !== chatId || typeof v.transitionId !== 'string' || !v.transitionId ||
    v.learningPath !== 'BASIC' || v.status !== 'AWAITING_CONTENT' || v.excludeFromGrowth !== true) {
    throw new Error('기초 학습 전환 상태가 올바르지 않아요.')
  }
  return { chatId, transitionId: v.transitionId, learningPath: 'BASIC', status: 'AWAITING_CONTENT', excludeFromGrowth: true }
}
