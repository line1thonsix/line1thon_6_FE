import { persistentMap } from './persistence.ts'
import type { MockPersistence } from './persistence.ts'
import { ANALYSIS_TIMEOUT_MS } from '../types/analysis.ts'
import type { AnalysisSnapshot, MockAnalysisRetryRequest } from '../types/analysis.ts'
import { readAnalysisSnapshot } from '../api/analysisSnapshot.ts'

export type AnalysisScenario = 'success' | 'slow' | 'fail-once' | 'fail-twice' | 'always-fail' | 'invalid-output' | 'recover' | 'timeout' | 'pending'
type Options = { persistence?: MockPersistence; fallback?: (chatId: string) => boolean; now?: () => number; scenario?: () => AnalysisScenario; durationMs?: number; validateResult?: (chatId: string, jobId: string, resultId: string) => boolean }
type Job = { snapshot: AnalysisSnapshot; scenario: AnalysisScenario; invalidOutput?: boolean; cancelled?: boolean }
export class MockAnalysisError extends Error {
  readonly code: string
  constructor(code: string) { super(code); this.code = code }
}
export function createAnalysisStore(options: Options = {}) {
  const now = options.now ?? Date.now
  const jobs = persistentMap<string, Job>('jobs', options.persistence)
  const retries = persistentMap<string, { chatId: string; jobId: string }>('retries', options.persistence)
  function makeJob(attempt: number): Job {
    const startedAt = now()
    return { snapshot: { jobId: crypto.randomUUID(), status: 'PENDING', attempt, maxAttempts: 3, startedAt, deadlineAt: startedAt + ANALYSIS_TIMEOUT_MS }, scenario: options.scenario?.() ?? 'success' }
  }
  function commitResult(chatId: string, jobId: string, resultId: string): boolean {
    const job = jobs.get(chatId)
    if (!job || !isCurrent(chatId, jobId) || job.snapshot.status !== 'PENDING') return false
    if (options.validateResult && !options.validateResult(chatId, jobId, resultId)) return false
    job.snapshot = { ...job.snapshot, status: 'DONE', resultId }
    jobs.set(chatId, job)
    return true
  }
  function get(chatId: string): AnalysisSnapshot | null {
    const job = jobs.get(chatId)
    if (!job || !isCurrent(chatId, job.snapshot.jobId)) return null
    // Persist the scenario with the job so refresh cannot restart the delay.
    const duration = (options.durationMs ?? 3000) * (job.scenario === 'slow' ? 10 : 1)
    const snapshot = job.snapshot
    if (snapshot.status === 'PENDING') {
      const elapsed = now() - snapshot.startedAt
      const fallback = !!options.fallback?.(chatId)
      const fail = !fallback && (job.scenario === 'always-fail' || job.scenario === 'invalid-output' ||
        (job.scenario === 'fail-once' && snapshot.attempt === 1) ||
        (job.scenario === 'fail-twice' && snapshot.attempt <= 2))
      // Resolve by server completion time even if the browser polls late.
      const neverFinishes = !fallback && ['timeout', 'pending'].includes(job.scenario)
      const finishesAfter = duration * (fail || job.scenario === 'recover' || fallback || job.invalidOutput ? 2 : 1)
      // Failed AI/invalid output gets exactly one internal re-call, not a new user attempt.
      if (elapsed >= ANALYSIS_TIMEOUT_MS && (neverFinishes || finishesAfter >= ANALYSIS_TIMEOUT_MS)) job.snapshot = { ...snapshot, status: 'FAILED', reason: 'TIMEOUT' }
      else if (fail && elapsed >= duration * 2) job.snapshot = { ...snapshot, status: 'FAILED', reason: job.scenario === 'invalid-output' ? 'INVALID_OUTPUT' : 'AI_ERROR' }
      else if (!fail && !neverFinishes && elapsed >= duration * (job.scenario === 'recover' || fallback ? 2 : 1)) {
        // A result must contain at least one valid, source-grounded finding before DONE.
        const validate = () => commitResult(chatId, snapshot.jobId, crypto.randomUUID())
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
    jobs.set(chatId, job)
    return readAnalysisSnapshot(job.snapshot)
  }
  function start(chatId: string): AnalysisSnapshot {
    const previous = jobs.get(chatId)
    if (!previous || previous.cancelled) jobs.set(chatId, makeJob(previous?.snapshot.attempt ?? 1))
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
  function cancel(chatId: string, jobId: string): 'CANCELLED' | 'COMPLETED' {
    const current = jobs.get(chatId)
    if (!current || current.snapshot.jobId !== jobId) throw new MockAnalysisError('STALE_JOB')
    if (current.cancelled) return 'CANCELLED'
    const snapshot = get(chatId)
    if (!snapshot) throw new MockAnalysisError('STALE_JOB')
    if (snapshot.status === 'DONE') return 'COMPLETED'
    if (snapshot.status !== 'PENDING') throw new MockAnalysisError('NOT_PENDING')
    // The job identity is a generation fence. A cancelled generation can never resolve.
    current.cancelled = true
    jobs.set(chatId, current)
    return 'CANCELLED'
  }
  function isCurrent(chatId: string, jobId: string) {
    const job = jobs.get(chatId)
    if (options.persistence) {
      const raw = options.persistence.read('jobs')
      const persisted = Array.isArray(raw) ? raw.find(row => Array.isArray(row) && row[0] === chatId)?.[1] as Job | undefined : undefined
      if (!persisted || persisted.cancelled || persisted.snapshot?.jobId !== jobId) return false
    }
    return !!job && !job.cancelled && job.snapshot.jobId === jobId
  }
  function remove(chatId: string) {
    jobs.delete(chatId)
    for (const [key, value] of retries) if (value.chatId === chatId) retries.delete(key)
  }
  return { start, get, retry, cancel, isCurrent, commitResult, remove }
}
