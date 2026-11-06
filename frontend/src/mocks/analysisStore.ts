import { ANALYSIS_TIMEOUT_MS } from '../types/analysis.ts'
import type { AnalysisSnapshot, MockAnalysisRetryRequest } from '../types/analysis.ts'
import { readAnalysisSnapshot } from '../api/analysisSnapshot.ts'

export type AnalysisScenario = 'success' | 'fail-once' | 'fail-twice' | 'always-fail' | 'invalid-output' | 'recover' | 'timeout' | 'pending'
type Options = { now?: () => number; scenario?: () => AnalysisScenario; durationMs?: number; validateResult?: (chatId: string, jobId: string, resultId: string) => boolean }
type Job = { snapshot: AnalysisSnapshot; scenario: AnalysisScenario; invalidOutput?: boolean }
export class MockAnalysisError extends Error {
  readonly code: string
  constructor(code: string) { super(code); this.code = code }
}
export function createAnalysisStore(options: Options = {}) {
  const now = options.now ?? Date.now
  const duration = options.durationMs ?? 3000
  const jobs = new Map<string, Job>()
  const retries = new Map<string, { chatId: string; jobId: string }>()
  function makeJob(attempt: number): Job {
    const startedAt = now()
    return { snapshot: { jobId: crypto.randomUUID(), status: 'PENDING', attempt, maxAttempts: 3, startedAt, deadlineAt: startedAt + ANALYSIS_TIMEOUT_MS }, scenario: options.scenario?.() ?? 'success' }
  }
  function get(chatId: string): AnalysisSnapshot | null {
    const job = jobs.get(chatId)
    if (!job) return null
    const snapshot = job.snapshot
    if (snapshot.status === 'PENDING') {
      const elapsed = now() - snapshot.startedAt
      const fail = job.scenario === 'always-fail' || job.scenario === 'invalid-output' ||
        (job.scenario === 'fail-once' && snapshot.attempt === 1) ||
        (job.scenario === 'fail-twice' && snapshot.attempt <= 2)
      // Resolve by server completion time even if the browser polls late.
      const neverFinishes = ['timeout', 'pending'].includes(job.scenario)
      const finishesAfter = duration * (fail || job.scenario === 'recover' || job.invalidOutput ? 2 : 1)
      // Failed AI/invalid output gets exactly one internal re-call, not a new user attempt.
      if (elapsed >= ANALYSIS_TIMEOUT_MS && (neverFinishes || finishesAfter >= ANALYSIS_TIMEOUT_MS)) job.snapshot = { ...snapshot, status: 'FAILED', reason: 'TIMEOUT' }
      else if (fail && elapsed >= duration * 2) job.snapshot = { ...snapshot, status: 'FAILED', reason: job.scenario === 'invalid-output' ? 'INVALID_OUTPUT' : 'AI_ERROR' }
      else if (!fail && !neverFinishes && elapsed >= duration * (job.scenario === 'recover' ? 2 : 1)) {
        // A result must contain at least one valid, source-grounded finding before DONE.
        const validate = () => {
          const resultId = crypto.randomUUID()
          if (options.validateResult && !options.validateResult(chatId, snapshot.jobId, resultId)) return false
          job.snapshot = { ...snapshot, status: 'DONE', resultId }
          return true
        }
        if (!job.invalidOutput) {
          if (!validate()) {
            if (job.scenario === 'recover') job.snapshot = { ...snapshot, status: 'FAILED', reason: 'INVALID_OUTPUT' }
            else job.invalidOutput = true
          }
        }
        if (job.invalidOutput && duration * 2 >= ANALYSIS_TIMEOUT_MS && elapsed >= ANALYSIS_TIMEOUT_MS) {
          job.snapshot = { ...snapshot, status: 'FAILED', reason: 'TIMEOUT' }
        } else if (job.invalidOutput && elapsed >= duration * 2) {
          if (!validate()) job.snapshot = { ...snapshot, status: 'FAILED', reason: 'INVALID_OUTPUT' }
        }
      }
    }
    return readAnalysisSnapshot(job.snapshot)
  }
  function start(chatId: string): AnalysisSnapshot {
    if (!jobs.has(chatId)) jobs.set(chatId, makeJob(1))
    return get(chatId)!
  }
  function retry(chatId: string, request: MockAnalysisRetryRequest): AnalysisSnapshot {
    const snapshot = get(chatId)
    if (!snapshot) throw new MockAnalysisError('LOCKED')
    const duplicate = retries.get(request.clientRequestId)
    if (duplicate) {
      if (duplicate.chatId !== chatId || duplicate.jobId !== request.jobId) throw new MockAnalysisError('REQUEST_CONFLICT')
      return snapshot
    }
    if (snapshot.status !== 'FAILED' || snapshot.jobId !== request.jobId) throw new MockAnalysisError('NOT_FAILED')
    if (snapshot.attempt >= 3) throw new MockAnalysisError('ATTEMPTS_EXHAUSTED')
    jobs.set(chatId, makeJob(snapshot.attempt + 1))
    retries.set(request.clientRequestId, { chatId, jobId: request.jobId })
    return get(chatId)!
  }
  return { start, get, retry }
}
