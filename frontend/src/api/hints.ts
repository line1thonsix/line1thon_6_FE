import { MOCK_CHATS_PATH } from './mockChatContract'
import { readHintState } from './hintState'
import type { HintInput } from '../types/hints'

// Mock-only provisional contract; never forward demo operations to an actual backend.
export async function requestMockHints(chatId: string, signal: AbortSignal, input?: HintInput) {
  if (!import.meta.env.DEV || import.meta.env.VITE_ENABLE_MOCKS !== 'true') throw new Error('힌트는 Mock 모드에서 사용할 수 있어요.')
  const response = await fetch(`${MOCK_CHATS_PATH}/${encodeURIComponent(chatId)}/hints`, {
    method: input ? 'POST' : 'GET', signal,
    ...(input ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) } : {}),
  })
  if (!response.ok) throw new Error('힌트를 불러오지 못했어요. 내 생각은 그대로 있어요. 다시 시도해 주세요.')
  return readHintState(await response.json(), chatId)
}
