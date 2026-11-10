import { MOCK_CHATS_PATH } from './mockChatContract'

export type CancellationTarget = { learningPath: 'SELF' | 'BASIC'; jobId: string }
export type CancellationRequest = CancellationTarget & { clientRequestId: string }
export function readCancellation(value: unknown, chatId: string, target: CancellationTarget) {
  if (!value || typeof value !== 'object') throw new Error('Invalid cancellation response')
  const v = value as Record<string, unknown>
  if (v.chatId !== chatId || v.jobId !== target.jobId || v.learningPath !== target.learningPath || !['CANCELLED', 'COMPLETED', 'STALE_JOB', 'NOT_PENDING'].includes(String(v.status))) throw new Error('Invalid cancellation response')
  return { chatId, jobId: target.jobId, learningPath: target.learningPath, status: String(v.status) }
}
// Temporary development-only contract. AbortController alone cannot cancel server work.
export async function cancelMockAnalysis(chatId: string, request: CancellationRequest, signal: AbortSignal) {
  if (!import.meta.env.DEV || import.meta.env.VITE_ENABLE_MOCKS !== 'true') throw new Error('분석 중지는 Mock 모드에서 사용할 수 있어요.')
  const response = await fetch(`${MOCK_CHATS_PATH}/${encodeURIComponent(chatId)}/analysis/cancel`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(request), signal,
  })
  if (!response.ok && response.status !== 409) throw new Error('분석 상태를 확인하지 못했어요. 내 생각은 그대로 있어요.')
  return readCancellation(await response.json(), chatId, request)
}
