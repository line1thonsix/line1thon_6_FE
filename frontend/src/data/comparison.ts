import type { FindingCategory } from '../types/comparison'
export const comparisonDisclaimer = 'AI의 답변은 정답이 아닌 참고 관점입니다. AI도 오류를 범하거나 중요한 조건을 놓칠 수 있어요. 내 생각과 AI의 분석을 비교하고, 실제 코드와 실행 결과를 통해 어떤 접근이 타당한지 직접 확인해 보세요.'
export const findingPresentation: Record<FindingCategory, { label: string; style: string }> = {
  COMMON: { label: '공통', style: 'finding-common' },
  COMPLEMENT: { label: '보완', style: 'finding-complement' },
  UNIQUE: { label: '고유', style: 'finding-unique' },
  CONFLICT: { label: '오류', style: 'finding-conflict' },
  UNDETERMINED: { label: '판단 보류', style: 'finding-undetermined' },
}
