import { readBasicLearningTransition } from './basicLearningState.ts'
import { stuckPoints } from '../types/hints.ts'
import type { HintState, StuckPoint, HintLevel } from '../types/hints.ts'

// Retain only explicitly opened hints. Invalid/extra levels invalidate the entire response.
export function readHintState(value: unknown, chatId: string): HintState {
  if (!value || typeof value !== 'object') throw new Error('힌트 상태를 확인할 수 없어요.')
  const v = value as Record<string, unknown>
  if (v.chatId !== chatId || ![0, 1, 2].includes(v.level as number) ||
    (v.stuckPoint !== null && !stuckPoints.includes(v.stuckPoint as StuckPoint)) ||
    !Array.isArray(v.hints) || v.hints.length !== v.level) throw new Error('힌트 응답이 올바르지 않아요.')
  if (v.stillDifficult !== undefined && typeof v.stillDifficult !== 'boolean') throw new Error('확인 상태가 올바르지 않아요.')
  const basicLearning = v.basicLearning == null ? null : readBasicLearningTransition(v.basicLearning, chatId)
  if ((v.stillDifficult === true || basicLearning) && v.level !== 2) throw new Error('힌트 확인 순서가 올바르지 않아요.')
  if (basicLearning && (!v.stuckPoint || v.stillDifficult !== true)) throw new Error('전환 조건이 올바르지 않아요.')
  const hints = v.hints.map((raw: unknown, index: number) => {
    if (!raw || typeof raw !== 'object') throw new Error('힌트를 확인할 수 없어요.')
    const hint = raw as Record<string, unknown>
    if (hint.level !== index + 1 || typeof hint.text !== 'string' || !hint.text.trim()) throw new Error('힌트를 확인할 수 없어요.')
    return { level: hint.level as 1 | 2, text: hint.text }
  })
  return { chatId, level: v.level as HintLevel, stuckPoint: v.stuckPoint as StuckPoint | null, hints,
    ...(v.stillDifficult !== undefined ? { stillDifficult: v.stillDifficult as boolean } : {}),
    ...(v.basicLearning !== undefined ? { basicLearning } : {}) }
}
