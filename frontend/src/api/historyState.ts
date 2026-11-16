import type { ConversationSummary, HistoryItem } from '../types/history.ts'
import { redactSecrets } from '../security/redaction.ts'
import { readDemoNotes } from '../storage/postResultDemo.ts'

export function readConversationSummaries(raw: unknown): ConversationSummary[] {
  const v = raw as { items?: unknown } | null
  if (!v || typeof v !== 'object' || !Array.isArray(v.items)) throw new Error('학습 기록 형식을 확인할 수 없어요.')
  const ids = new Set<string>()
  return v.items.map(value => {
    const row = value as ConversationSummary | null
    if (!row || typeof row !== 'object' || typeof row.id !== 'string' || !row.id || ids.has(row.id) ||
      typeof row.question !== 'string' || !row.question.trim() || row.question.length > 2000 ||
      ![null, 'SELF', 'BASIC'].includes(row.learningPath) || !['LOCKED', 'PENDING', 'FAILED', 'DONE'].includes(row.progress) ||
      !Number.isSafeInteger(row.createdAt) || row.createdAt < 0 || !Number.isSafeInteger(row.updatedAt) || row.updatedAt < row.createdAt || row.updatedAt > 8640000000000000 ||
      (row.learningPath === null && row.progress !== 'LOCKED')) throw new Error('학습 기록 형식을 확인할 수 없어요.')
    ids.add(row.id)
    // Rebuild the object so extra server fields cannot preload locked content.
    return { id: row.id, question: redactSecrets(row.question).value, learningPath: row.learningPath, progress: row.progress, createdAt: row.createdAt, updatedAt: row.updatedAt }
  }).sort((a, b) => b.updatedAt - a.updatedAt || b.createdAt - a.createdAt || a.id.localeCompare(b.id))
}
export function withDemoReflections(items: ConversationSummary[], readNote: (id: string) => unknown): HistoryItem[] {
  return items.map(item => {
    const note = readDemoNotes(readNote(item.id))
    // Unsubmitted drafts and opinions never appear as a reflection in history.
    const reflection = item.learningPath === 'BASIC' || item.progress === 'DONE' ? note.saved.reflection : null
    const savedAt = reflection ? note.savedAt?.reflection ?? 0 : 0
    return { ...item, reflection, updatedAt: Math.max(item.updatedAt, savedAt) }
  }).sort((a, b) => b.updatedAt - a.updatedAt || b.createdAt - a.createdAt || a.id.localeCompare(b.id))
}
