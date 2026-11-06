import { MOCK_CHATS_PATH } from './mockChatContract'
import { readAnalysisSnapshot } from './analysisSnapshot'
import type { MockAnalysisRetryRequest } from '../types/analysis'

async function analysisRequest(chatId: string, signal: AbortSignal, retry?: MockAnalysisRetryRequest) {
  if (!import.meta.env.DEV || import.meta.env.VITE_ENABLE_MOCKS !== 'true') throw new Error('Mock mode required')
  const response = await fetch(`${MOCK_CHATS_PATH}/${encodeURIComponent(chatId)}/analysis${retry ? '/retry' : ''}`, {
    method: retry ? 'POST' : 'GET', signal,
    ...(retry ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(retry) } : {}),
  })
  if (!response.ok) throw new Error('Analysis request failed')
  return readAnalysisSnapshot(await response.json())
}
export const fetchMockAnalysis = (chatId: string, signal: AbortSignal) => analysisRequest(chatId, signal)
export const retryMockAnalysis = (chatId: string, request: MockAnalysisRetryRequest, signal: AbortSignal) => analysisRequest(chatId, signal, request)
