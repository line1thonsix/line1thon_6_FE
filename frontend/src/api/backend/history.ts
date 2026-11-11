import type { BackendClient } from './client.ts'
import { backendPaths, backendQuestionTypes } from './contracts.ts'
import type { BackendQuestionType } from './contracts.ts'
import { assertNoResultContent } from './lockState.ts'
import { redactSecrets } from '../../security/redaction.ts'
import type { HistoryItem } from '../../types/history.ts'

export function readBackendHistory(raw: unknown): HistoryItem[] {
  assertNoResultContent(raw)
  const items = (raw as { items?: unknown } | null)?.items
  if (!Array.isArray(items) || items.length > 50) throw new Error('Invalid backend history')
  const ids = new Set<number>()
  return items.map(item => {
    if (!item || typeof item !== 'object') throw new Error('Invalid backend history entry')
    const { chatId, type, questionPreview, status, category, reflection, createdAt } = item
    const timestamp = typeof createdAt === 'string' ? Date.parse(createdAt) : NaN
    if (!Number.isSafeInteger(chatId) || chatId <= 0 || ids.has(chatId) ||
        !backendQuestionTypes.includes(type as BackendQuestionType) ||
        typeof questionPreview !== 'string' || !questionPreview.trim() || questionPreview.length > 2000 ||
        !Number.isFinite(timestamp) || timestamp <= 0 ||
        (reflection !== null && typeof reflection !== 'string')) throw new Error('Invalid backend history entry')
    const expected = status === 'LOCKED' ? null : status === 'UNLOCKED_SELF' ? 'COMPARED' : status === 'UNLOCKED_ASSISTED' ? 'BASIC' : undefined
    if (expected === undefined || category !== expected) throw new Error('Invalid backend history category')
    ids.add(chatId)
    return {
      id: String(chatId), question: redactSecrets(questionPreview).value,
      learningPath: category === 'COMPARED' ? 'SELF' : category === 'BASIC' ? 'BASIC' : null,
      progress: category === null ? 'LOCKED' : 'DONE', createdAt: timestamp, updatedAt: timestamp,
      reflection: category !== null && reflection ? redactSecrets(reflection).value : null,
    }
  })
}

export function fetchBackendHistory(client: BackendClient, guest: string, signal: AbortSignal) {
  return client.request(backendPaths.chats + '?limit=50', { method: 'GET', guest, signal, decode: readBackendHistory })
}

export function deleteBackendData(client: BackendClient, guest: string, signal: AbortSignal, chatId?: number) {
  return client.request(chatId === undefined ? backendPaths.sessionMe : backendPaths.chat(chatId), {
    method: 'DELETE', guest, signal,
    decode: (body, status) => {
      if (status !== 204 || body !== null) throw new Error('Invalid delete confirmation')
    },
  })
}
