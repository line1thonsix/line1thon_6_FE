import { ANALYSIS_TIMEOUT_MS } from '../types/analysis.ts'
import type { AnalysisSnapshot, AnalysisFailure } from '../types/analysis.ts'

export function readAnalysisSnapshot(value: unknown): AnalysisSnapshot {
  if (!value || typeof value !== 'object') throw new Error('Invalid analysis response')
  const v = value as Record<string, unknown>
  if (typeof v.jobId !== 'string' || !v.jobId || !Number.isInteger(v.attempt) ||
    (v.attempt as number) < 1 || (v.attempt as number) > 3 || v.maxAttempts !== 3 ||
    typeof v.startedAt !== 'number' || !Number.isFinite(v.startedAt) ||
    typeof v.deadlineAt !== 'number' || v.deadlineAt !== v.startedAt + ANALYSIS_TIMEOUT_MS) {
    throw new Error('Invalid analysis metadata')
  }
  const base = { jobId: v.jobId, attempt: v.attempt as number, maxAttempts: 3 as const, startedAt: v.startedAt, deadlineAt: v.deadlineAt }
  // Explicit projection drops answer/result content even on malformed extra fields.
  if (v.status === 'PENDING') return { ...base, status: 'PENDING' }
  if (v.status === 'FAILED' && ['AI_ERROR', 'INVALID_OUTPUT', 'TIMEOUT'].includes(v.reason as string)) {
    return { ...base, status: 'FAILED', reason: v.reason as AnalysisFailure }
  }
  if (v.status === 'DONE' && typeof v.resultId === 'string' && v.resultId) return { ...base, status: 'DONE', resultId: v.resultId }
  throw new Error('Invalid analysis status')
}
