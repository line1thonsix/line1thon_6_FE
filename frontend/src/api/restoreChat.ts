import { readLockedChat } from './lockedChat.ts'
import { readAnalysisSnapshot } from './analysisSnapshot.ts'
import { readPendingThought } from './pendingThought.ts'
import { MOCK_CHATS_PATH } from './mockChatContract.ts'

// Temporary Mock read contract. A real server adapter must supply the same safe projection.
export function readRestoredChat(value: unknown) {
  const chat = readLockedChat(value)
  const raw = value as Record<string, unknown>
  if (raw.thoughtId === undefined && raw.thought === undefined && raw.analysis === undefined) return { chat, receipt: null }
  const analysis = readAnalysisSnapshot(raw.analysis)
  const receipt = readPendingThought({ chatId: chat.id, status: 'LOCKED', thoughtId: raw.thoughtId,
    thought: raw.thought, analysis: { jobId: analysis.jobId, status: 'PENDING' } })
  return { chat, receipt }
}
export async function restoreMockChat(id: string, signal: AbortSignal) {
  if (!import.meta.env.DEV || import.meta.env.VITE_ENABLE_MOCKS !== 'true') throw new Error('실제 API 복원 어댑터가 아직 연결되지 않았어요. Mock 모드에서 실행해 주세요.')
  const response = await fetch(`${MOCK_CHATS_PATH}/${encodeURIComponent(id)}`, { signal })
  if (response.status === 404) throw new Error('저장된 대화를 찾을 수 없어요. 새 채팅을 시작해 주세요.')
  if (!response.ok) throw new Error('대화 상태를 불러오지 못했어요. 다시 확인해 주세요.')
  return readRestoredChat(await response.json())
}
