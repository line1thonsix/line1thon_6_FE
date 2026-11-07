import { redactValue } from '../security/redaction'
import { notifyRedaction } from '../security/redactionNotice'
import type { LockedChat } from '../types/chat'
import { MOCK_CHATS_PATH } from './mockChatContract'
import type { MockCreateChatRequest } from './mockChatContract'
import { readLockedChat } from './lockedChat'

export async function createMockChat(input: MockCreateChatRequest, signal: AbortSignal): Promise<LockedChat> {
  // Explicit opt-in prevents a development stub from reaching a real backend.
  if (!import.meta.env.DEV || import.meta.env.VITE_ENABLE_MOCKS !== 'true') {
    throw new Error('질문 전송은 Mock 모드에서 사용할 수 있어요. npm run dev:mock으로 실행해 주세요.')
  }
  const safe = redactValue(input)
  if (safe.redacted) notifyRedaction()
  const response = await fetch(MOCK_CHATS_PATH, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(safe.value), signal,
  })
  if (!response.ok) throw new Error('질문을 읽는 중 연결이 지연됐어요. 입력한 내용은 그대로 있어요.')
  return readLockedChat(await response.json())
}
