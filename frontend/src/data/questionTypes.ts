import type { QuestionType } from '../types/chat'
export const questionTypeOptions: { value: QuestionType; label: string; description: string }[] = [
  { value: 'FREE', label: '자유롭게', description: '정하지 않아도 돼요. AI가 알맞은 유형을 골라 줘요' },
  { value: 'CONCEPT', label: '개념 이해', description: '정의, 적용 조건, 예시, 한계를 비교해요' },
  { value: 'DEBUGGING', label: '디버깅', description: '재현 조건, 원인 가설, 확인 방법, 수정의 영향을 비교해요' },
  { value: 'PROBLEM_SOLVING', label: '문제 해결 접근', description: '요구사항, 접근법, 예외, 검증 방법을 비교해요' },
  { value: 'DESIGN', label: '설계 판단', description: '조건, 대안, 장단점, 선택 근거를 비교해요' },
]
export function questionTypeLabel(type: QuestionType) {
  return questionTypeOptions.find(option => option.value === type)?.label ?? '자유롭게'
}
