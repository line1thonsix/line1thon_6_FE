import { redactSecrets } from '../security/redaction.ts'
import type { FollowUpSnapshot } from '../types/followUp.ts'

export function validateFollowUp(text: string): string | null {
  if (!text.trim()) return '질문을 적어 주세요.'
  if (text.length > 2000) return '질문은 2,000자까지 입력할 수 있어요.'
  return null
}
export function readFollowUps(raw: unknown, chatId: string): FollowUpSnapshot {
  const fail = () => { throw new Error('후속 대화를 불러오지 못했어요. 다시 시도해 주세요.') }
  if (!raw || typeof raw !== 'object') return fail()
  const v = raw as Record<string, unknown>
  if (v.chatId !== chatId || !Array.isArray(v.items) || v.items.length > 5 || !Number.isInteger(v.remaining) || Number(v.remaining) < 0 || Number(v.remaining) > 5 - v.items.length) return fail()
  const ids = new Set<string>()
  const items = v.items.map(item => {
    if (!item || typeof item !== 'object' || typeof item.id !== 'string' || !item.id || ids.has(item.id) || typeof item.question !== 'string' || validateFollowUp(item.question) || typeof item.answer !== 'string' || !item.answer.trim()) return fail()
    ids.add(item.id)
    return { id: item.id, question: redactSecrets(item.question).value, answer: redactSecrets(item.answer).value }
  })
  return { chatId, items, remaining: Number(v.remaining) }
}
