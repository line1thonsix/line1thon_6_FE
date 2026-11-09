export const THOUGHT_MIN_LENGTH = 30
export const THOUGHT_MAX_LENGTH = 2000
export const THOUGHT_MIN_DISTINCT = 8
export const THOUGHT_GUIDANCE = '선택지 문구를 제외하고 생각을 30자 이상 적어 주세요. 직접 작성분에는 공백을 제외한 서로 다른 문자가 8개 이상 필요해요.'
export const THOUGHT_TOO_LONG = '생각은 앞뒤 공백을 제외하고 2,000자까지 입력할 수 있어요.'

export function thoughtMetrics(value: string) {
  const normalized = value.trim()
  return { normalized, length: normalized.length, distinct: new Set(normalized.replace(/\s/gu, '')).size }
}
export function validateThought(value: string, manual: string = value): string | null {
  const { length } = thoughtMetrics(value)
  const { length: manualLength, distinct } = thoughtMetrics(manual)
  if (manualLength < THOUGHT_MIN_LENGTH) return THOUGHT_GUIDANCE
  if (length > THOUGHT_MAX_LENGTH) return THOUGHT_TOO_LONG
  if (distinct < THOUGHT_MIN_DISTINCT) return THOUGHT_GUIDANCE
  return null
}
export function appendThought(current: string, inserted: string): string {
  // Keep all user text. Overlong insertion produces a validation error, never truncation.
  return current ? `${current}${/\s$/u.test(current) ? '' : ' '}${inserted}` : inserted
}
