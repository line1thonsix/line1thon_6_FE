import { readSession } from '../storage/session'
import { MOCK_CHATS_PATH } from './mockChatContract'

// MSW-only provisional routes. No request is sent to a real backend.
export async function deleteMockData(chatId?: string): Promise<void> {
  if (!import.meta.env.DEV || import.meta.env.VITE_ENABLE_MOCKS !== 'true') throw new Error('MOCK_ONLY')
  const owner = readSession('deveil:mock-server:v1:ownerToken')
  if (typeof owner !== 'string' || !owner) throw new Error('MOCK_OWNER_UNAVAILABLE')
  const response = await fetch(chatId ? `${MOCK_CHATS_PATH}/${encodeURIComponent(chatId)}` : MOCK_CHATS_PATH, { method: 'DELETE', headers: { 'X-Mock-Guest-Token': owner } })
  if (response.status !== 204) throw new Error('DELETION_UNAVAILABLE')
}
