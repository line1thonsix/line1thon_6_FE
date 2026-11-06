export const THOUGHT_MIN_LENGTH = 30
export const THOUGHT_MAX_LENGTH = 2000
export const THOUGHT_MIN_DISTINCT = 8
export const THOUGHT_GUIDANCE = '이유나 확인 방법을 조금 더 적어 볼까요? 30자 이상이면 함께 비교할 수 있어요.'
export const THOUGHT_TOO_LONG = '생각은 앞뒤 공백을 제외하고 2,000자까지 입력할 수 있어요.'

export function thoughtMetrics(value: string) {
  const normalized = value.trim()
  return { normalized, length: normalized.length, distinct: new Set(normalized.replace(/\s/gu, '')).size }
}
export function validateThought(value: string): string | null {
  const { length, distinct } = thoughtMetrics(value)
  if (length < THOUGHT_MIN_LENGTH) return THOUGHT_GUIDANCE
  if (length > THOUGHT_MAX_LENGTH) return THOUGHT_TOO_LONG
  if (distinct < THOUGHT_MIN_DISTINCT) return THOUGHT_GUIDANCE
  return null
}
export function appendThought(current: string, inserted: string): string {
  // Keep all user text. Overlong insertion produces a validation error, never truncation.
  return current ? `${current}${/\s$/u.test(current) ? '' : ' '}${inserted}` : inserted
}
