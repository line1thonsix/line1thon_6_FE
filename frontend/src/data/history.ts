import type { HistoryFilter, HistoryItem } from '../types/history.ts'

export const historyFilters: { value: HistoryFilter; label: string }[] = [
  { value: 'ALL', label: '전체' }, { value: 'SELF', label: '비교 완료' }, { value: 'BASIC', label: '기초 학습' },
]
type Navigation = { historyActive: boolean; stage: string; chatId?: string }
export function shouldRefreshHistory(previous: Navigation, current: Navigation) {
  return (current.historyActive && !previous.historyActive) ||
    (current.stage === 'locked' && previous.stage === 'creating') ||
    (!current.historyActive && !!current.chatId && current.chatId !== previous.chatId)
}
export function historyLabel(item: HistoryItem) {
  if (item.learningPath === 'BASIC') return '기초 학습'
  return { LOCKED: '답변 잠금', PENDING: '분석 중', FAILED: '분석 실패', DONE: '비교 완료' }[item.progress]
}
export function filterHistory(items: HistoryItem[], filter: HistoryFilter) {
  return items.filter(item => filter === 'ALL' || (filter === 'BASIC' ? item.learningPath === 'BASIC' : item.learningPath === 'SELF' && item.progress === 'DONE'))
}
function dateKey(date: Date) { return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}` }
export function groupHistory(items: HistoryItem[], now = new Date()) {
  const yesterday = new Date(now); yesterday.setDate(now.getDate() - 1)
  const groups = new Map<string, HistoryItem[]>()
  for (const item of [...items].sort((a, b) => b.updatedAt - a.updatedAt || b.createdAt - a.createdAt || a.id.localeCompare(b.id))) {
    const date = new Date(item.updatedAt)
    const key = dateKey(date)
    const label = item.updatedAt === 0 ? '이전 기록' : key === dateKey(now) ? '오늘' : key === dateKey(yesterday) ? '어제' : `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, '0')}.${String(date.getDate()).padStart(2, '0')}`
    groups.set(label, [...(groups.get(label) ?? []), item])
  }
  return [...groups].map(([label, entries]) => ({ label, entries }))
}
export function historyTime(timestamp: number) {
  if (!timestamp) return ''
  return new Intl.DateTimeFormat('ko-KR', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(timestamp)
}
