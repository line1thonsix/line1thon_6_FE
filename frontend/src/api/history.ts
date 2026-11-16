import { MOCK_CHATS_PATH } from './mockChatContract'
import { readConversationSummaries } from './historyState'

export async function fetchMockHistory(signal: AbortSignal) {
  if (!import.meta.env.DEV || import.meta.env.VITE_ENABLE_MOCKS !== 'true') throw new Error('학습 기록은 Mock 모드에서 확인할 수 있어요. 실제 API는 아직 연결되지 않았어요.')
  const response = await fetch(MOCK_CHATS_PATH, { signal })
  if (!response.ok) throw new Error('학습 기록을 불러오지 못했어요. 다시 시도해 주세요.')
  return readConversationSummaries(await response.json())
}
