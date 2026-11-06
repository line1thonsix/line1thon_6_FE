import { http, HttpResponse } from 'msw/http'
import { delay } from 'msw'
import { MOCK_CHATS_PATH } from '../api/mockChatContract.ts'
import { validateQuestion } from '../api/chatValidation.ts'
import { readLockedChat } from '../api/lockedChat.ts'
import { questionTypes } from '../types/chat.ts'
import type { QuestionDraft, LockedChat } from '../types/chat.ts'
import { getPreparation } from './chatFixtures.ts'

type Scenario = 'success' | 'error-once' | 'error' | 'slow'
type Options = { scenario?: () => Scenario; delayMs?: number; origin?: string }
type Result = { ok: true; chat: LockedChat } | { ok: false }
type Entry = { fingerprint: string; attempts: number; pending?: Promise<Result>; result?: LockedChat }

export function createChatHandlers(options: Options = {}) {
  const path = options.origin ? new URL(MOCK_CHATS_PATH, options.origin).href : MOCK_CHATS_PATH
  const requests = new Map<string, Entry>()
  const chats = new Map<string, LockedChat>()
  return [
    http.post(path, async ({ request }) => {
      let body: Record<string, unknown>
      try {
        const value: unknown = await request.json()
        if (!value || typeof value !== 'object') throw new Error('Invalid JSON')
        body = value as Record<string, unknown>
      } catch { return HttpResponse.json({ code: 'INVALID_REQUEST' }, { status: 400 }) }
      if (typeof body.question !== 'string' || typeof body.code !== 'string' ||
        !questionTypes.includes(body.type as QuestionDraft['type']) ||
        typeof body.clientRequestId !== 'string' || !body.clientRequestId || body.clientRequestId.length > 100) {
        return HttpResponse.json({ code: 'INVALID_REQUEST' }, { status: 400 })
      }
      const draft: QuestionDraft = { question: body.question, code: body.code, type: body.type as QuestionDraft['type'] }
      const error = validateQuestion(draft)
      if (error) return HttpResponse.json({ code: 'INVALID_INPUT', message: error }, { status: 400 })
      const key = body.clientRequestId
      const fingerprint = JSON.stringify(draft)
      const entry = requests.get(key) ?? { fingerprint, attempts: 0 }
      if (entry.fingerprint !== fingerprint) return HttpResponse.json({ code: 'REQUEST_CONFLICT' }, { status: 409 })
      requests.set(key, entry)
      if (entry.result) return HttpResponse.json(readLockedChat(entry.result), { status: 201 })
      if (!entry.pending) {
        entry.attempts += 1
        entry.pending = (async (): Promise<Result> => {
          const scenario = options.scenario?.() ?? 'success'
          await delay(options.delayMs ?? (scenario === 'slow' ? 5000 : 1200))
          if (scenario === 'error' || (scenario === 'error-once' && entry.attempts === 1)) return { ok: false }
          const chat: LockedChat = {
            id: crypto.randomUUID(), status: 'LOCKED', ...draft,
            ...getPreparation(draft.type, draft.question),
          }
          entry.result = chat
          chats.set(chat.id, chat)
          return { ok: true, chat }
        })()
      }
      const result = await entry.pending
      entry.pending = undefined
      return result.ok
        ? HttpResponse.json(readLockedChat(result.chat), { status: 201 })
        : HttpResponse.json({ code: 'MOCK_PREPARATION_FAILED' }, { status: 503 })
    }),
    http.get(`${path}/:chatId`, ({ params }) => {
      const chat = chats.get(String(params.chatId))
      return chat ? HttpResponse.json(readLockedChat(chat)) : HttpResponse.json({ code: 'NOT_FOUND' }, { status: 404 })
    }),
  ]
}

export const handlers = createChatHandlers({
  scenario: () => {
    const scenario = new URL(location.href).searchParams.get('mock')
    return scenario === 'error' || scenario === 'error-once' || scenario === 'slow' ? scenario : 'success'
  },
})
