import { MOCK_CHATS_PATH } from './mockChatContract'
import { readFollowUps } from './followUpState'
import type { FollowUpRequest } from '../types/followUp'

// No calls in production or actual-API mode; backend endpoint is not agreed yet.
export async function fetchMockFollowUps(chatId: string, signal: AbortSignal, body?: FollowUpRequest) {
  if (!import.meta.env.DEV || import.meta.env.VITE_ENABLE_MOCKS !== 'true') throw new Error('후속 질문은 Mock 모드에서 사용할 수 있어요.')
  const response = await fetch(`${MOCK_CHATS_PATH}/${encodeURIComponent(chatId)}/follow-ups`, {
    signal, ...(body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}),
  })
  if (!response.ok) throw new Error(response.status === 403 ? '결과 공개 후에만 질문할 수 있어요.' : response.status === 429 ? '질문 가능 횟수를 모두 사용했어요.' : response.status === 409 ? '이전 요청을 확인한 뒤 다시 시도해 주세요.' : '후속 대화를 불러오지 못했어요. 다시 시도해 주세요.')
  return readFollowUps(await response.json(), chatId)
}
