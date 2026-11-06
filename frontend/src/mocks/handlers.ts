import { http, HttpResponse } from 'msw/http'
import { delay } from 'msw'
import { MOCK_CHATS_PATH } from '../api/mockChatContract.ts'
import { validateQuestion } from '../api/chatValidation.ts'
import { readLockedChat } from '../api/lockedChat.ts'
import { questionTypes } from '../types/chat.ts'
import type { QuestionDraft, LockedChat } from '../types/chat.ts'
import { validateThought, thoughtMetrics, THOUGHT_TOO_LONG } from '../api/thoughtValidation.ts'
import { readPendingThought } from '../api/pendingThought.ts'
import type { PendingThought } from '../types/thought.ts'
import { createAnalysisStore, MockAnalysisError } from './analysisStore.ts'
import type { AnalysisScenario } from './analysisStore.ts'
import { buildComparisonFixture } from './comparisonFixtures.ts'
import type { ComparisonScenario } from './comparisonFixtures.ts'
import { readComparisonResult } from '../api/comparisonResult.ts'
import type { ComparisonResult } from '../types/comparison.ts'
import { getPreparation } from './chatFixtures.ts'

type Scenario = 'success' | 'error-once' | 'error' | 'slow'
type Options = { scenario?: () => Scenario; delayMs?: number; origin?: string; thoughtScenario?: () => Scenario; thoughtDelayMs?: number; analysisScenario?: () => AnalysisScenario; analysisDurationMs?: number; now?: () => number; comparisonScenario?: () => ComparisonScenario }
type Result = { ok: true; chat: LockedChat } | { ok: false }
type Entry = { fingerprint: string; attempts: number; pending?: Promise<Result>; result?: LockedChat }

export function createChatHandlers(options: Options = {}) {
  const path = options.origin ? new URL(MOCK_CHATS_PATH, options.origin).href : MOCK_CHATS_PATH
  const requests = new Map<string, Entry>()
  const chats = new Map<string, LockedChat>()
  const thoughts = new Map<string, PendingThought>()
  const results = new Map<string, ComparisonResult>()
  const analyses = createAnalysisStore({ now: options.now, scenario: options.analysisScenario, durationMs: options.analysisDurationMs,
    validateResult: (chatId, jobId, resultId) => {
      const chat = chats.get(chatId)
      const saved = thoughts.get(chatId)
      if (!chat || !saved) return false
      try {
        const raw = buildComparisonFixture(chat, saved.thought, jobId, resultId, options.comparisonScenario?.() ?? 'standard')
        const verified = readComparisonResult(raw, saved.thought)
        results.set(resultId, verified)
        return true
      } catch { return false }
    },
  })
  const thoughtAttempts = new Map<string, number>()
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
    http.post(`${path}/:chatId/thoughts`, async ({ request, params }) => {
      const chatId = String(params.chatId)
      if (!chats.has(chatId)) return HttpResponse.json({ code: 'NOT_FOUND' }, { status: 404 })
      let body: Record<string, unknown>
      try {
        const value: unknown = await request.json()
        if (!value || typeof value !== 'object') throw new Error('Invalid JSON')
        body = value as Record<string, unknown>
      } catch { return HttpResponse.json({ code: 'INVALID_REQUEST' }, { status: 400 }) }
      if (typeof body.thought !== 'string' || typeof body.clientRequestId !== 'string' ||
        !body.clientRequestId || body.clientRequestId.length > 100) {
        return HttpResponse.json({ code: 'INVALID_REQUEST' }, { status: 400 })
      }
      const error = validateThought(body.thought)
      if (error) return HttpResponse.json({ code: error === THOUGHT_TOO_LONG ? 'THOUGHT_TOO_LONG' : 'THOUGHT_INVALID', message: error }, { status: 400 })
      const normalized = thoughtMetrics(body.thought).normalized
      let saved = thoughts.get(chatId)
      if (saved && saved.thought !== normalized) return HttpResponse.json({ code: 'THOUGHT_IMMUTABLE' }, { status: 409 })
      if (!saved) {
        // Save the original before any async work/failure; one job per chat.
        saved = { chatId, status: 'LOCKED', thoughtId: crypto.randomUUID(), thought: normalized,
          analysis: { jobId: crypto.randomUUID(), status: 'PENDING' } }
        thoughts.set(chatId, saved)
        const analysis = analyses.start(chatId)
        saved.analysis = { jobId: analysis.jobId, status: 'PENDING' }
      }
      const attempt = (thoughtAttempts.get(chatId) ?? 0) + 1
      thoughtAttempts.set(chatId, attempt)
      const scenario = options.thoughtScenario?.() ?? 'success'
      await delay(options.thoughtDelayMs ?? options.delayMs ?? (scenario === 'slow' ? 5000 : 900))
      if (scenario === 'error' || (scenario === 'error-once' && attempt === 1)) {
        return HttpResponse.json({ code: 'MOCK_THOUGHT_SUBMISSION_FAILED' }, { status: 503 })
      }
      return HttpResponse.json(readPendingThought(saved), { status: 202 })
    }),
    http.post(`${path}/:chatId/analysis/retry`, async ({ request, params }) => {
      const chatId = String(params.chatId)
      if (!chats.has(chatId)) return HttpResponse.json({ code: 'NOT_FOUND' }, { status: 404 })
      let body: Record<string, unknown>
      try {
        const value: unknown = await request.json()
        if (!value || typeof value !== 'object') throw new Error('Invalid JSON')
        body = value as Record<string, unknown>
      } catch { return HttpResponse.json({ code: 'INVALID_REQUEST' }, { status: 400 }) }
      if (typeof body.jobId !== 'string' || !body.jobId || typeof body.clientRequestId !== 'string' || !body.clientRequestId || body.clientRequestId.length > 100) {
        return HttpResponse.json({ code: 'INVALID_REQUEST' }, { status: 400 })
      }
      try {
        return HttpResponse.json(analyses.retry(chatId, { jobId: body.jobId, clientRequestId: body.clientRequestId }), { status: 202 })
      } catch (error) {
        return HttpResponse.json({ code: error instanceof MockAnalysisError ? error.code : 'RETRY_FAILED' }, { status: 409 })
      }
    }),
    http.get(`${path}/:chatId/result`, ({ params, request }) => {
      const chatId = String(params.chatId)
      if (!chats.has(chatId)) return HttpResponse.json({ code: 'NOT_FOUND' }, { status: 404 })
      // Never trust query parameters/client UI state to open the lock.
      const analysis = analyses.get(chatId)
      if (!analysis || analysis.status !== 'DONE') return HttpResponse.json({ code: 'LOCKED' }, { status: 403 })
      if (new URL(request.url).searchParams.get('resultId') !== analysis.resultId) return HttpResponse.json({ code: 'NOT_FOUND' }, { status: 404 })
      const result = results.get(analysis.resultId)
      if (!result || options.comparisonScenario?.() === 'fetch-error') return HttpResponse.json({ code: 'RESULT_UNAVAILABLE' }, { status: 503 })
      return HttpResponse.json(result)
    }),
    http.get(`${path}/:chatId/analysis`, ({ params }) => {
      const chatId = String(params.chatId)
      if (!chats.has(chatId)) return HttpResponse.json({ code: 'NOT_FOUND' }, { status: 404 })
      const snapshot = analyses.get(chatId)
      return snapshot ? HttpResponse.json(snapshot) : HttpResponse.json({ code: 'LOCKED' }, { status: 403 })
    }),
    http.get(`${path}/:chatId`, ({ params }) => {
      const chat = chats.get(String(params.chatId))
      const saved = thoughts.get(String(params.chatId))
      return chat ? HttpResponse.json({ ...readLockedChat(chat), ...(saved ? { thoughtId: saved.thoughtId, thought: saved.thought, analysis: analyses.get(String(params.chatId)) } : {}) }) : HttpResponse.json({ code: 'NOT_FOUND' }, { status: 404 })
    }),
  ]
}

export const handlers = createChatHandlers({
  comparisonScenario: () => {
    const scenario = new URL(location.href).searchParams.get('result')
    return ['all-categories', 'sparse', 'invalid-quote', 'all-invalid', 'empty', 'fetch-error'].includes(scenario ?? '') ? scenario as ComparisonScenario : 'standard'
  },
  analysisScenario: () => {
    const scenario = new URL(location.href).searchParams.get('analysis')
    return ['fail-once', 'fail-twice', 'always-fail', 'invalid-output', 'recover', 'timeout', 'pending'].includes(scenario ?? '') ? scenario as AnalysisScenario : 'success'
  },
  thoughtScenario: () => {
    const scenario = new URL(location.href).searchParams.get('thought')
    return scenario === 'error' || scenario === 'error-once' || scenario === 'slow' ? scenario : 'success'
  },
  scenario: () => {
    const scenario = new URL(location.href).searchParams.get('mock')
    return scenario === 'error' || scenario === 'error-once' || scenario === 'slow' ? scenario : 'success'
  },
})
