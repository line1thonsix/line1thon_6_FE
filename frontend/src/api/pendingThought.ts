import type { PendingThought } from '../types/thought.ts'
import { validateThought } from './thoughtValidation.ts'

export function readPendingThought(value: unknown): PendingThought {
  if (!value || typeof value !== 'object') throw new Error('제출 상태를 확인할 수 없어요.')
  const v = value as Record<string, unknown>
  const analysis = v.analysis as Record<string, unknown> | undefined
  if (v.status !== 'LOCKED' || typeof v.chatId !== 'string' || !v.chatId ||
    typeof v.thoughtId !== 'string' || !v.thoughtId || typeof v.thought !== 'string' ||
    validateThought(v.thought) || !analysis || analysis.status !== 'PENDING' ||
    typeof analysis.jobId !== 'string' || !analysis.jobId) {
    throw new Error('제출 상태가 올바르지 않아요. 같은 내용으로 다시 확인해 주세요.')
  }
  return { chatId: v.chatId, status: 'LOCKED', thoughtId: v.thoughtId, thought: v.thought,
    analysis: { jobId: analysis.jobId, status: 'PENDING' } }
}
