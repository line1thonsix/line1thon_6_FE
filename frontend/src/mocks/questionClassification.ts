import type { QuestionDraft, QuestionType } from '../types/chat.ts'
export type ClassificationScenario = 'success' | 'error' | 'invalid'
export type Classification = { requestedType: QuestionType; source: 'USER' | 'MOCK_AUTO' | 'FALLBACK' }
// Deterministic development substitute for an AI classifier. Manual selection always wins.
export function classifyMockQuestion(draft: QuestionDraft, scenario: ClassificationScenario = 'success'): { type: QuestionType; classification: Classification } {
  const requestedType = draft.type
  if (requestedType !== 'FREE') return { type: requestedType, classification: { requestedType, source: 'USER' } }
  if (scenario !== 'success') return { type: 'FREE', classification: { requestedType, source: 'FALLBACK' } }
  const text = draft.question
  let type: QuestionType = 'FREE'
  if (/오류|에러|undefined|exception|작동하지|안 돼|버그|디버깅|반복문의 마지막/iu.test(text)) type = 'DEBUGGING'
  else if (/설계|장단점|트레이드오프|대안|선택|아키텍처|vs\.?/iu.test(text)) type = 'DESIGN'
  else if (/어떻게|해결|알고리즘|중복|결제 버튼|접근법/u.test(text)) type = 'PROBLEM_SOLVING'
  else if (/개념|정의|무엇|뭔가|차이|언제 필요|원리|이해/u.test(text)) type = 'CONCEPT'
  return { type, classification: { requestedType, source: type === 'FREE' ? 'FALLBACK' : 'MOCK_AUTO' } }
}
