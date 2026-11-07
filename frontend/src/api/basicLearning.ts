import { MOCK_CHATS_PATH } from './mockChatContract'
import { readBasicLearningTransition } from './basicLearningState'

export async function transitionMockBasicLearning(chatId: string, clientRequestId: string, signal: AbortSignal) {
  if (!import.meta.env.DEV || import.meta.env.VITE_ENABLE_MOCKS !== 'true') throw new Error('기초 학습 전환은 Mock 모드에서 사용할 수 있어요.')
  const response = await fetch(`${MOCK_CHATS_PATH}/${encodeURIComponent(chatId)}/basic-learning`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ clientRequestId }), signal,
  })
  if (!response.ok) throw new Error('기초 학습 전환을 확인하지 못했어요. 내 생각은 보관되어 있어요. 다시 확인해 주세요.')
  return readBasicLearningTransition(await response.json(), chatId)
}
