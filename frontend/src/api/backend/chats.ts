import type { BackendClient } from './client.ts'
import { backendPaths } from './contracts.ts'
import type { BackendCreateChatRequest } from './contracts.ts'
import { validateBackendCreateChat, readBackendCreatedChat } from './validation.ts'
import { redactValue } from '../../security/redaction.ts'
import { notifyRedaction } from '../../security/redactionNotice.ts'

// Preparation stays asynchronous. Never turn the POST receipt into LockedChat
// or assume choices exist; the future UI adapter must poll chat detail instead.
export async function createBackendChat(client: BackendClient, input: BackendCreateChatRequest, signal: AbortSignal) {
  validateBackendCreateChat(input)
  const safe = redactValue({ clientRequestId: input.clientRequestId, type: input.type,
    question: input.question, code: input.code, exampleId: input.exampleId })
  if (safe.redacted) notifyRedaction()
  validateBackendCreateChat(safe.value)
  return client.request(backendPaths.chats, { method: 'POST', body: safe.value, signal, decode: readBackendCreatedChat })
}
