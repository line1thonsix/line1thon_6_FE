import { questionTypes } from '../types/chat.ts'
import type { LockedChat, QuestionType } from '../types/chat.ts'

// Runtime allowlist: never retain arbitrary fields from a response in UI state.
export function readLockedChat(value: unknown): LockedChat {
  if (!value || typeof value !== 'object') throw new Error('잠금 응답을 확인할 수 없어요.')
  const v = value as Record<string, unknown>
  if (v.status !== 'LOCKED' || typeof v.id !== 'string' || !v.id ||
    typeof v.question !== 'string' || typeof v.code !== 'string' ||
    !questionTypes.includes(v.type as QuestionType) || !Array.isArray(v.choices) ||
    v.choices.length !== 3 || !v.choices.every(c => typeof c === 'string' && c.trim()) ||
    typeof v.exampleSentence !== 'string' || !v.exampleSentence.trim()) {
    throw new Error('잠금 응답 형식이 올바르지 않아요. 다시 시도해 주세요.')
  }
  return {
    id: v.id, status: 'LOCKED', question: v.question, code: v.code,
    type: v.type as QuestionType,
    choices: [v.choices[0], v.choices[1], v.choices[2]],
    exampleSentence: v.exampleSentence,
  }
}
