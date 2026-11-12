import type { FindingCategory } from '../types/comparison'
export const comparisonDisclaimer = 'AI의 답변은 정답이 아닌 참고 관점입니다. AI도 오류를 범하거나 중요한 조건을 놓칠 수 있어요. 내 생각과 AI의 분석을 비교하고, 실제 코드와 실행 결과를 통해 어떤 접근이 타당한지 직접 확인해 보세요.'
export const findingDisplayOrder = ['COMMON', 'CONFLICT', 'COMPLEMENT', 'UNIQUE', 'UNDETERMINED'] as const
export const findingPresentation: Record<FindingCategory, { label: string; style: string }> = {
  COMMON: { label: '공통', style: 'finding-common' },
  COMPLEMENT: { label: '보완', style: 'finding-complement' },
  UNIQUE: { label: '고유', style: 'finding-unique' },
  CONFLICT: { label: '오류', style: 'finding-conflict' },
  UNDETERMINED: { label: '판단 보류', style: 'finding-undetermined' },
}
export const emptyFindingMessage: Record<FindingCategory, string> = {
  COMMON: '이번 분석에서 공통으로 분류된 내용이 없어요.',
  CONFLICT: '이번 분석에서 별도로 지적된 오류는 없어요.',
  COMPLEMENT: '이번 분석에서 별도로 제안된 보완점은 없어요.',
  UNIQUE: '이번 분석에서 고유한 관점으로 분류된 내용은 없어요.',
  UNDETERMINED: '이번 분석에서 판단을 보류한 항목은 없어요.',
}
