import { redactValue } from '../security/redaction'
import { notifyRedaction } from '../security/redactionNotice'
import { MOCK_CHATS_PATH } from './mockChatContract'
import type { MockSubmitThoughtRequest } from './mockChatContract'
import { readPendingThought } from './pendingThought'
import { THOUGHT_GUIDANCE, THOUGHT_TOO_LONG } from './thoughtValidation'

export class ThoughtSubmissionError extends Error {
  readonly kind: 'validation' | 'transport'
  constructor(message: string, kind: 'validation' | 'transport' = 'transport') {
    super(message)
    this.kind = kind
  }
}
export async function submitMockThought(chatId: string, input: MockSubmitThoughtRequest, signal: AbortSignal) {
  if (!import.meta.env.DEV || import.meta.env.VITE_ENABLE_MOCKS !== 'true') {
    throw new ThoughtSubmissionError('생각 제출은 Mock 모드에서 사용할 수 있어요. npm run dev:mock으로 실행해 주세요.')
  }
  const safe = redactValue(input)
  if (safe.redacted) notifyRedaction()
  const response = await fetch(`${MOCK_CHATS_PATH}/${encodeURIComponent(chatId)}/thoughts`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(safe.value), signal,
  })
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as { code?: string }
    if (body.code === 'THOUGHT_TOO_LONG') throw new ThoughtSubmissionError(THOUGHT_TOO_LONG, 'validation')
    if (body.code === 'THOUGHT_INVALID') throw new ThoughtSubmissionError(THOUGHT_GUIDANCE, 'validation')
    throw new ThoughtSubmissionError('연결이 지연되고 있어요. 내 생각은 그대로 있어요.')
  }
  const receipt = readPendingThought(await response.json())
  if (receipt.chatId !== chatId || receipt.thought !== safe.value.thought) {
    throw new ThoughtSubmissionError('제출한 내용과 저장 상태가 달라요. 같은 내용으로 다시 확인해 주세요.')
  }
  return receipt
}
