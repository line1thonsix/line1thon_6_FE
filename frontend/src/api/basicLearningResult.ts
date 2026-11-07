import { MOCK_CHATS_PATH } from './mockChatContract'
import { readBasicLearningResult } from './basicLearningResultState'
import type { BasicLearningTransition } from '../types/learning'

// Provisional Mock-only endpoint. The actual backend contract remains independent.
export async function fetchMockBasicLearningResult(transition: BasicLearningTransition, signal: AbortSignal) {
  if (!import.meta.env.DEV || import.meta.env.VITE_ENABLE_MOCKS !== 'true') throw new Error('기초 학습 결과는 Mock 모드에서 사용할 수 있어요.')
  const response = await fetch(`${MOCK_CHATS_PATH}/${encodeURIComponent(transition.chatId)}/basic-learning/result?transitionId=${encodeURIComponent(transition.transitionId)}`, { signal })
  if (!response.ok) throw new Error(response.status === 403 ? '기초 학습 전환이 허용된 대화에서만 볼 수 있어요.' : response.status === 404 ? '기초 학습 결과를 찾을 수 없어요.' : '기초 학습 결과를 불러오지 못했어요. 다시 시도해 주세요.')
  return readBasicLearningResult(await response.json(), transition.chatId, transition.transitionId)
}
