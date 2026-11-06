import { MOCK_CHATS_PATH } from './mockChatContract'
import { readComparisonResult } from './comparisonResult'
import type { AnalysisCompletion } from '../types/analysis'

export async function fetchMockComparison(completion: AnalysisCompletion, thought: string, signal: AbortSignal) {
  if (!import.meta.env.DEV || import.meta.env.VITE_ENABLE_MOCKS !== 'true') throw new Error('결과 조회는 Mock 모드에서 사용할 수 있어요.')
  // Development-only endpoint; the final backend result DTO remains independent.
  const response = await fetch(`${MOCK_CHATS_PATH}/${encodeURIComponent(completion.chatId)}/result?resultId=${encodeURIComponent(completion.resultId)}`, { signal })
  if (!response.ok) throw new Error(response.status === 403 ? '아직 잠긴 결과예요. 내 생각은 그대로 있어요.' : '결과를 불러오지 못했어요. 내 생각은 그대로 있어요.')
  const result = readComparisonResult(await response.json(), thought)
  if (result.chatId !== completion.chatId || result.jobId !== completion.jobId || result.resultId !== completion.resultId) throw new Error('분석과 결과가 일치하지 않아요. 다시 확인해 주세요.')
  return result
}
