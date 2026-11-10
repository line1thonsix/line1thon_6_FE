import { persistentMap } from './persistence.ts'
import type { MockPersistence } from './persistence.ts'
import type { FollowUp, FollowUpRequest, FollowUpSnapshot } from '../types/followUp.ts'
import { validateFollowUp } from '../api/followUpState.ts'
import { redactSecrets } from '../security/redaction.ts'

export class FollowUpError extends Error {
  code: string
  status: number
  constructor(code: string, status: number) { super(code); this.code = code; this.status = status }
}
export type FollowUpContext = { question: string; code: string; thought: string | null; referenceAnswer: string; previous: FollowUp[] }
type Entry = { chatId: string; question: string; id: string; attempts: number; done: boolean }
export function createFollowUpStore(persistence?: MockPersistence) {
  const conversations = persistentMap<string, FollowUp[]>('followUps', persistence)
  const requests = persistentMap<string, Entry>('followUpRequests', persistence)
  const pending = new Map<string, Promise<FollowUpSnapshot>>()
  const snapshot = (chatId: string): FollowUpSnapshot => {
    const items = conversations.get(chatId) ?? []
    const accepted = [...requests.values()].filter(entry => entry.chatId === chatId).length
    return { chatId, items, remaining: Math.max(0, 5 - accepted) }
  }
  return {
    snapshot,
    remove(chatId: string) {
      conversations.delete(chatId)
      for (const [key, value] of requests) if (value.chatId === chatId) requests.delete(key)
    },
    async submit(chatId: string, request: FollowUpRequest, generate: (attempt: number, previous: FollowUp[]) => Promise<string>, consume: () => void) {
      const originalError = validateFollowUp(request.question)
      const question = redactSecrets(request.question).value
      if (originalError || validateFollowUp(question)) throw new FollowUpError('INVALID_INPUT', 400)
      const existing = requests.get(request.clientRequestId)
      if (existing && (existing.chatId !== chatId || existing.question !== question)) throw new FollowUpError('REQUEST_CONFLICT', 409)
      if (existing?.done) return snapshot(chatId)
      const inflight = pending.get(request.clientRequestId)
      if (inflight) return inflight
      // One request per conversation, including failed/lost acknowledgements.
      if ([...requests.entries()].some(([key, entry]) => entry.chatId === chatId && !entry.done && key !== request.clientRequestId && pending.has(key))) throw new FollowUpError('FOLLOW_UP_BUSY', 409)
      if (!existing && snapshot(chatId).remaining <= 0) throw new FollowUpError('FOLLOW_UP_LIMIT', 429)
      if (!existing) consume()
      const entry = existing ?? { chatId, question, id: crypto.randomUUID(), attempts: 0, done: false }
      entry.attempts++; requests.set(request.clientRequestId, entry)
      const work = (async () => {
        const answer = redactSecrets(await generate(entry.attempts, snapshot(chatId).items)).value
        if (requests.get(request.clientRequestId) !== entry) throw new FollowUpError('NOT_FOUND', 404)
        if (!answer.trim()) throw new FollowUpError('FOLLOW_UP_UNAVAILABLE', 503)
        // No original question, thought, analysis or comparison mutations.
        const items = [...snapshot(chatId).items, { id: entry.id, question, answer }]
        conversations.set(chatId, items)
        entry.done = true; requests.set(request.clientRequestId, entry)
        return snapshot(chatId)
      })()
      pending.set(request.clientRequestId, work)
      try { return await work } finally { pending.delete(request.clientRequestId) }
    },
  }
}

// Fixed development response, never an AI call. User text is data, not instructions.
export function buildFollowUpFixture(context: FollowUpContext, _question: string): string {
  const anchor = context.referenceAnswer.split(/[。\n]/u)[0]
  return `${anchor}\n${context.thought ? '처음 적은 생각' : '기초 학습 내용'}과 연결해 조건을 하나씩 바꾸어 확인해 보세요.${context.previous.length ? ' 앞서 나눈 후속 대화의 확인 방법도 같은 조건에서 비교해 보세요.' : ''}`
}
