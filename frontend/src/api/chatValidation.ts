import type { QuestionDraft } from '../types/chat.ts'

export const QUESTION_MAX_LENGTH = 2000
export const CODE_MAX_LENGTH = 6000
export function validateQuestion(draft: QuestionDraft): string | null {
  if (!draft.question.trim()) return '떠오른 질문이나 생각을 한 줄 적어 주세요.'
  if (draft.question.length > QUESTION_MAX_LENGTH) return '질문은 2,000자까지 입력할 수 있어요.'
  if (draft.code.length > CODE_MAX_LENGTH) return '코드는 6,000자까지 입력할 수 있어요.'
  return null
}
