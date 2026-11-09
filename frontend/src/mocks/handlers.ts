import { redactValue, redactSecrets } from '../security/redaction.ts'
import { classifyMockQuestion } from './questionClassification.ts'
import type { ClassificationScenario } from './questionClassification.ts'
import { buildBasicLearningFixture } from './basicLearningFixtures.ts'
import { readBasicLearningResult } from '../api/basicLearningResultState.ts'
import type { BasicLearningTransition } from '../types/learning.ts'
import { openedHints } from './hintFixtures.ts'
import { stuckPoints } from '../types/hints.ts'
import type { StuckPoint, HintLevel } from '../types/hints.ts'
import { persistentMap } from './persistence.ts'
import type { MockPersistence } from './persistence.ts'
import { buildSavedExample, isSavedExample } from './savedExamples.ts'
import { readSession, writeSession } from '../storage/session.ts'
import { http, HttpResponse } from 'msw/http'
import { delay } from 'msw'
import { MOCK_CHATS_PATH } from '../api/mockChatContract.ts'
import { validateQuestion } from '../api/chatValidation.ts'
import { readLockedChat } from '../api/lockedChat.ts'
import { questionTypes } from '../types/chat.ts'
import type { QuestionDraft, LockedChat } from '../types/chat.ts'
import { choiceSentence } from '../api/thoughtDraft.ts'
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

type BasicResultScenario = 'success' | 'error-once' | 'error' | 'slow' | 'empty' | 'invalid'
type Scenario = 'success' | 'error-once' | 'error' | 'slow'
type Options = { classificationScenario?: () => ClassificationScenario; basicResultScenario?: () => BasicResultScenario; basicResultDelayMs?: number; persistence?: MockPersistence; demo?: () => boolean; scenario?: () => Scenario; delayMs?: number; origin?: string; thoughtScenario?: () => Scenario; thoughtDelayMs?: number; analysisScenario?: () => AnalysisScenario; analysisDurationMs?: number; now?: () => number; comparisonScenario?: () => ComparisonScenario; basicScenario?: () => Scenario }
type Result = { ok: true; chat: LockedChat } | { ok: false }
type Entry = { fingerprint: string; attempts: number; pending?: Promise<Result>; result?: LockedChat }

export function createChatHandlers(options: Options = {}) {
  const path = options.origin ? new URL(MOCK_CHATS_PATH, options.origin).href : MOCK_CHATS_PATH
  const requests = persistentMap<string, Entry>('requests', options.persistence)
  const chats = persistentMap<string, LockedChat>('chats', options.persistence)
  const thoughts = persistentMap<string, PendingThought>('thoughts', options.persistence)
  const hints = persistentMap<string, { level: HintLevel; stuckPoint: StuckPoint | null; stillDifficult?: boolean }>('hints', options.persistence)
  const basicLearning = persistentMap<string, BasicLearningTransition>('basicLearning', options.persistence)
  const basicRequests = persistentMap<string, string>('basicRequests', options.persistence)
  const basicAttempts = persistentMap<string, number>('basicAttempts', options.persistence)
  const basicResults = persistentMap<string, { resultId: string; attempts: number }>('basicResults', options.persistence)
  const results = new Map<string, ComparisonResult>()
  const settings = persistentMap<string, { saved: boolean; comparison: ComparisonScenario }>('settings', options.persistence)
  const usesSaved = (chatId: string) => settings.get(chatId)?.saved ?? false
  const makeResult = (chat: LockedChat, thought: string, jobId: string, resultId: string) =>
    usesSaved(chat.id) ? buildSavedExample(chat, thought, jobId, resultId) : buildComparisonFixture(chat, thought, jobId, resultId, settings.get(chat.id)?.comparison ?? 'standard')
  const analyses = createAnalysisStore({ persistence: options.persistence, fallback: usesSaved, now: options.now, scenario: options.analysisScenario, durationMs: options.analysisDurationMs,
    validateResult: (chatId, jobId, resultId) => {
      const chat = chats.get(chatId)
      const saved = thoughts.get(chatId)
      if (!chat || !saved) return false
      try {
        const raw = makeResult(chat, saved.thought, jobId, resultId)
        const verified = readComparisonResult(raw, saved.thought)
        results.set(resultId, verified)
        return true
      } catch { return false }
    },
  })
  const thoughtAttempts = persistentMap<string, number>('thoughtAttempts', options.persistence)
  return [
    http.get(`${path}/:chatId/hints`, ({ params }) => {
      const chat = chats.get(String(params.chatId))
      if (!chat) return HttpResponse.json({ code: 'NOT_FOUND' }, { status: 404 })
      const saved = hints.get(chat.id) ?? { level: 0 as const, stuckPoint: null }
      return HttpResponse.json({ chatId: chat.id, ...saved, stillDifficult: saved.stillDifficult ?? false, basicLearning: basicLearning.get(chat.id) ?? null, hints: openedHints(chat, saved.level) })
    }),
    http.post(`${path}/:chatId/hints`, async ({ request, params }) => {
      const chat = chats.get(String(params.chatId))
      if (!chat) return HttpResponse.json({ code: 'NOT_FOUND' }, { status: 404 })
      let body: Record<string, unknown>
      try {
        const value = await request.json()
        if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error()
        body = value as Record<string, unknown>
      } catch { return HttpResponse.json({ code: 'INVALID_REQUEST' }, { status: 400 }) }
      // Recheck after awaiting the body: thought submission may have raced this request.
      if (thoughts.has(chat.id) || basicLearning.has(chat.id)) return HttpResponse.json({ code: 'ALREADY_SUBMITTED' }, { status: 409 })
      const saved = hints.get(chat.id) ?? { level: 0 as HintLevel, stuckPoint: null as StuckPoint | null }
      let next = { ...saved }
      if (Object.keys(body).length !== 1) return HttpResponse.json({ code: 'INVALID_REQUEST' }, { status: 400 })
      if ('level' in body) {
        if (body.level !== 1 && body.level !== 2) return HttpResponse.json({ code: 'INVALID_LEVEL' }, { status: 400 })
        if (body.level > saved.level + 1) return HttpResponse.json({ code: 'HINT_ORDER_REQUIRED' }, { status: 409 })
        // Explicit target levels make repeated clicks/lost acknowledgements idempotent.
        next.level = Math.max(saved.level, body.level) as HintLevel
      } else if ('stuckPoint' in body) {
        if (!stuckPoints.includes(body.stuckPoint as StuckPoint)) return HttpResponse.json({ code: 'INVALID_STUCK_POINT' }, { status: 400 })
        if (saved.level < 1) return HttpResponse.json({ code: 'HINT_ORDER_REQUIRED' }, { status: 409 })
        next.stuckPoint = body.stuckPoint as StuckPoint
      } else if ('stillDifficult' in body) {
        if (typeof body.stillDifficult !== 'boolean') return HttpResponse.json({ code: 'INVALID_REQUEST' }, { status: 400 })
        if (saved.level !== 2) return HttpResponse.json({ code: 'HINT_ORDER_REQUIRED' }, { status: 409 })
        next.stillDifficult = body.stillDifficult
      } else return HttpResponse.json({ code: 'INVALID_REQUEST' }, { status: 400 })
      hints.set(chat.id, next)
      return HttpResponse.json({ chatId: chat.id, ...next, stillDifficult: next.stillDifficult ?? false, basicLearning: null, hints: openedHints(chat, next.level) })
    }),
    http.get(`${path}/:chatId/basic-learning/result`, async ({ params, request }) => {
      const chatId = String(params.chatId)
      const chat = chats.get(chatId)
      if (!chat) return HttpResponse.json({ code: 'NOT_FOUND' }, { status: 404 })
      const transition = basicLearning.get(chatId)
      const help = hints.get(chatId)
      // Only server-owned F-09 state grants access. Client path/status/conditions are ignored.
      if (!transition || thoughts.has(chatId) || help?.level !== 2 || !help.stuckPoint || help.stillDifficult !== true) {
        return HttpResponse.json({ code: 'BASIC_ACCESS_DENIED' }, { status: 403 })
      }
      if (new URL(request.url).searchParams.get('transitionId') !== transition.transitionId) return HttpResponse.json({ code: 'NOT_FOUND' }, { status: 404 })
      const metadata = basicResults.get(chatId) ?? { resultId: crypto.randomUUID(), attempts: 0 }
      basicResults.set(chatId, metadata)
      const scenario = options.basicResultScenario?.() ?? 'success'
      await delay(options.basicResultDelayMs ?? options.delayMs ?? (scenario === 'slow' ? 5000 : 900))
      // Abandoned GETs must not consume the first-error scenario or publish anything.
      if (request.signal.aborted) return new HttpResponse(null, { status: 499 })
      metadata.attempts += 1
      basicResults.set(chatId, metadata)
      if (scenario === 'error' || (scenario === 'error-once' && metadata.attempts === 1)) return HttpResponse.json({ code: 'BASIC_RESULT_UNAVAILABLE' }, { status: 503 })
      try {
        const raw = buildBasicLearningFixture(chat, transition, metadata.resultId)
        if (scenario === 'empty') raw.concept = ''
        if (scenario === 'invalid') raw.steps = [] as unknown as typeof raw.steps
        // No partial answer if any required section is empty/invalid.
        return HttpResponse.json(readBasicLearningResult(raw, chatId, transition.transitionId))
      } catch { return HttpResponse.json({ code: 'BASIC_RESULT_INVALID' }, { status: 503 }) }
    }),
    http.post(`${path}/:chatId/basic-learning`, async ({ params, request }) => {
      const chatId = String(params.chatId)
      if (!chats.has(chatId)) return HttpResponse.json({ code: 'NOT_FOUND' }, { status: 404 })
      let body: Record<string, unknown>
      try {
        const raw = await request.json()
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error()
        body = raw as Record<string, unknown>
      } catch { return HttpResponse.json({ code: 'INVALID_REQUEST' }, { status: 400 }) }
      if (Object.keys(body).length !== 1 || typeof body.clientRequestId !== 'string' || !body.clientRequestId || body.clientRequestId.length > 100) {
        return HttpResponse.json({ code: 'INVALID_REQUEST' }, { status: 400 })
      }
      const owner = basicRequests.get(body.clientRequestId)
      if (owner && owner !== chatId) return HttpResponse.json({ code: 'REQUEST_CONFLICT' }, { status: 409 })
      if (thoughts.has(chatId)) return HttpResponse.json({ code: 'LEARNING_PATH_CONFLICT' }, { status: 409 })
      let saved = basicLearning.get(chatId)
      if (!saved) {
        const help = hints.get(chatId)
        if (help?.level !== 2 || !help.stuckPoint || help.stillDifficult !== true) {
          return HttpResponse.json({ code: 'BASIC_CONDITIONS_REQUIRED' }, { status: 409 })
        }
        // Commit synchronously before the async acknowledgement. One path wins any race.
        saved = { chatId, transitionId: crypto.randomUUID(), learningPath: 'BASIC', status: 'AWAITING_CONTENT', excludeFromGrowth: true }
        basicLearning.set(chatId, saved)
      }
      basicRequests.set(body.clientRequestId, chatId)
      const attempt = (basicAttempts.get(chatId) ?? 0) + 1
      basicAttempts.set(chatId, attempt)
      const scenario = options.basicScenario?.() ?? 'success'
      await delay(options.delayMs ?? (scenario === 'slow' ? 5000 : 500))
      if (scenario === 'error' || (scenario === 'error-once' && attempt === 1)) return HttpResponse.json({ code: 'BASIC_ACK_FAILED' }, { status: 503 })
      return HttpResponse.json(saved, { status: 202 })
    }),
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
      const original: QuestionDraft = { question: body.question, code: body.code, type: body.type as QuestionDraft['type'] }
      const originalError = validateQuestion(original)
      if (originalError) return HttpResponse.json({ code: 'INVALID_INPUT', message: originalError }, { status: 400 })
      const draft = redactValue(original).value
      const error = validateQuestion(draft)
      if (error) return HttpResponse.json({ code: 'INVALID_INPUT', message: error }, { status: 400 })
      const key = body.clientRequestId
      const fingerprint = JSON.stringify(draft)
      const entry = requests.get(key) ?? { fingerprint, attempts: 0 }
      if (entry.fingerprint !== fingerprint) return HttpResponse.json({ code: 'REQUEST_CONFLICT' }, { status: 409 })
      requests.set(key, entry)
      if (entry.result) return HttpResponse.json(readLockedChat(entry.result), { status: 201 })
      if (!entry.pending || typeof entry.pending.then !== 'function') {
        entry.attempts += 1
        entry.pending = (async (): Promise<Result> => {
          const scenario = options.scenario?.() ?? 'success'
          await delay(options.delayMs ?? (scenario === 'slow' ? 5000 : 1200))
          if (scenario === 'error' || (scenario === 'error-once' && entry.attempts === 1)) return { ok: false }
          const classified = classifyMockQuestion(draft, options.classificationScenario?.())
          const chat: LockedChat = {
            id: crypto.randomUUID(), status: 'LOCKED', ...draft, ...classified,
            ...getPreparation(classified.type, draft.question),
          }
          entry.result = chat
          settings.set(chat.id, { saved: !!options.demo?.() && isSavedExample(chat) &&
            ['always-fail', 'fail-once', 'fail-twice', 'invalid-output', 'timeout'].includes(options.analysisScenario?.() ?? 'success'),
            comparison: options.comparisonScenario?.() ?? 'standard' })
          chats.set(chat.id, chat)
          requests.set(key, entry)
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
      if (basicLearning.has(chatId)) return HttpResponse.json({ code: 'LEARNING_PATH_CONFLICT' }, { status: 409 })
      if (body.thought.trim().length > 2000) return HttpResponse.json({ code: 'THOUGHT_TOO_LONG' }, { status: 400 })
      const safeThought = redactSecrets(body.thought).value
      let manual = safeThought
      if (body.suggestion !== undefined) {
        const v = body.suggestion as { index?: unknown; start?: unknown; end?: unknown } | null
        if (!v || !Number.isInteger(v.index) || Number(v.index) < 0 || Number(v.index) > 2 ||
          !Number.isInteger(v.start) || !Number.isInteger(v.end) || Number(v.start) < 0 || Number(v.end) <= Number(v.start) || Number(v.end) > safeThought.length) {
          return HttpResponse.json({ code: 'THOUGHT_INVALID' }, { status: 400 })
        }
        const start = Number(v.start), end = Number(v.end)
        const expected = choiceSentence(chats.get(chatId)!, Number(v.index))
        const actual = safeThought.slice(start, end)
        if (![expected, expected.trimEnd(), ' ' + expected, ' ' + expected.trimEnd()].includes(actual)) {
          return HttpResponse.json({ code: 'THOUGHT_INVALID' }, { status: 400 })
        }
        manual = safeThought.slice(0, start) + safeThought.slice(end)
      }
      const error = validateThought(safeThought, manual)
      if (error) return HttpResponse.json({ code: error === THOUGHT_TOO_LONG ? 'THOUGHT_TOO_LONG' : 'THOUGHT_INVALID', message: error }, { status: 400 })
      const normalized = thoughtMetrics(safeThought).normalized
      let saved = thoughts.get(chatId)
      if (saved && saved.thought !== normalized) return HttpResponse.json({ code: 'THOUGHT_IMMUTABLE' }, { status: 409 })
      if (!saved) {
        // Save the original before any async work/failure; one job per chat.
        saved = { chatId, status: 'LOCKED', thoughtId: crypto.randomUUID(), thought: normalized,
          analysis: { jobId: crypto.randomUUID(), status: 'PENDING' } }
        thoughts.set(chatId, saved)
        const analysis = analyses.start(chatId)
        saved.analysis = { jobId: analysis.jobId, status: 'PENDING' }
        thoughts.set(chatId, saved)
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
      let result = results.get(analysis.resultId)
      if (!result) {
        const chat = chats.get(chatId)!
        const saved = thoughts.get(chatId)
        if (saved) {
          try { result = readComparisonResult(makeResult(chat, saved.thought, analysis.jobId, analysis.resultId), saved.thought) }
          catch { return HttpResponse.json({ code: 'RESULT_UNAVAILABLE' }, { status: 503 }) }
        }
      }
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
      return chat ? HttpResponse.json({ ...readLockedChat(chat), learningPath: basicLearning.has(chat.id) ? 'BASIC' : 'SELF', ...(basicLearning.has(chat.id) ? { basicLearning: basicLearning.get(chat.id) } : {}), ...(saved ? { thoughtId: saved.thoughtId, thought: saved.thought, analysis: analyses.get(String(params.chatId)) } : {}) }) : HttpResponse.json({ code: 'NOT_FOUND' }, { status: 404 })
    }),
  ]
}

export const handlers = createChatHandlers({
  persistence: typeof sessionStorage === 'undefined' ? undefined : {
    read: key => readSession(`deveil:mock-server:v1:${key}`),
    write: (key, value) => { writeSession(`deveil:mock-server:v1:${key}`, value) },
  },
  classificationScenario: () => {
    const scenario = new URL(location.href).searchParams.get('classification')
    return scenario === 'error' || scenario === 'invalid' ? scenario : 'success'
  },
  basicResultScenario: () => {
    const scenario = new URL(location.href).searchParams.get('basicResult')
    return ['error-once', 'error', 'slow', 'empty', 'invalid'].includes(scenario ?? '') ? scenario as BasicResultScenario : 'success'
  },
  basicScenario: () => {
    const scenario = new URL(location.href).searchParams.get('basic')
    return scenario === 'error' || scenario === 'error-once' || scenario === 'slow' ? scenario : 'success'
  },
  demo: () => new URL(location.href).searchParams.get('demo') === 'true',
  comparisonScenario: () => {
    const scenario = new URL(location.href).searchParams.get('result')
    return ['all-categories', 'sparse', 'invalid-quote', 'all-invalid', 'empty', 'fetch-error'].includes(scenario ?? '') ? scenario as ComparisonScenario : 'standard'
  },
  analysisScenario: () => {
    const scenario = new URL(location.href).searchParams.get('analysis')
    return ['slow', 'fail-once', 'fail-twice', 'always-fail', 'invalid-output', 'recover', 'timeout', 'pending'].includes(scenario ?? '') ? scenario as AnalysisScenario : 'success'
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
